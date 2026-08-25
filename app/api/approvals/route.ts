import {NextResponse} from 'next/server';
import {z} from 'zod';
import {requireSession} from '@/lib/server/auth';
import {query,tx} from '@/lib/server/db';
import {sha256} from '@/lib/server/hash';
import {getLedger} from '@/lib/server/chain';
import {verifyApprovalSignature} from '@/lib/server/signature';
import {requireProjectAccess} from '@/lib/server/access';
import {appendAudit} from '@/lib/server/audit';

const Body=z.object({lifecycleEventId:z.string().uuid(),decision:z.enum(['APPROVED','REJECTED']),comment:z.string().max(1000).optional(),signature:z.string().min(16),signingKeyId:z.string().uuid()});

export async function POST(req:Request){try{
 const s=await requireSession(['SUPER_ADMIN','ORG_ADMIN','PROJECT_MANAGER','INSPECTOR']);
 const b=Body.parse(await req.json());
 const e=await query<any>(`SELECT le.*,COALESCE(string_agg(ev.sha256,'' ORDER BY ev.sha256),'') evidence_concat,COUNT(ev.id)::int evidence_count FROM lifecycle_events le LEFT JOIN evidence ev ON ev.lifecycle_event_id=le.id WHERE le.id=$1 AND le.organization_id=$2 GROUP BY le.id`,[b.lifecycleEventId,s.organizationId]);
 const event=e.rows[0];if(!event)return NextResponse.json({error:'Lifecycle event not found'},{status:404});
 if(event.status==='VERIFIED')return NextResponse.json({status:'VERIFIED',receipt:{network:event.ledger_network,txHash:event.ledger_tx_hash,blockHeight:event.ledger_block_height,timestamp:event.anchored_at}});
 if(event.status==='REJECTED')return NextResponse.json({error:'This lifecycle event has already been rejected.'},{status:409});
 await requireProjectAccess(s,event.project_id);
 if(event.performed_by===s.userId)return NextResponse.json({error:'Separation of duties: performer cannot approve the same lifecycle event.'},{status:409});
 const policyResult=await query<any>(`SELECT * FROM approval_policies WHERE organization_id=$1 AND project_id=$2 AND is_active=true LIMIT 1`,[s.organizationId,event.project_id]);
 const policy=policyResult.rows[0]||{id:null,approvals_required:1,allowed_roles:['INSPECTOR','PROJECT_MANAGER','ORG_ADMIN','SUPER_ADMIN'],require_evidence:true};
 if(!policy.allowed_roles.includes(s.role))return NextResponse.json({error:`Role ${s.role} is not permitted by this project's approval policy.`},{status:403});
 if(policy.require_evidence&&Number(event.evidence_count||0)<1)return NextResponse.json({error:'This project requires at least one evidence item before approval.'},{status:409});
 const k=await query<{id:string;public_key_jwk:JsonWebKey;fingerprint_sha256:string;algorithm:string}>(`SELECT id,public_key_jwk,fingerprint_sha256,algorithm FROM user_signing_keys WHERE id=$1 AND organization_id=$2 AND user_id=$3 AND revoked_at IS NULL LIMIT 1`,[b.signingKeyId,s.organizationId,s.userId]);
 const signingKey=k.rows[0];if(!signingKey)return NextResponse.json({error:'Registered active signing key not found for this user.'},{status:422});
 if(!verifyApprovalSignature(event.payload_sha256,b.signature,signingKey.public_key_jwk))return NextResponse.json({error:'Approval signature could not be verified against the registered signing identity.'},{status:422});
 const evidenceHash=sha256(event.evidence_concat||'');
 if(b.decision==='REJECTED'){
  await tx(async c=>{await c.query(`SELECT pg_advisory_xact_lock(hashtext($1))`,[`approval:${b.lifecycleEventId}`]);await c.query(`INSERT INTO approvals(organization_id,lifecycle_event_id,approver_user_id,decision,comment,signature,public_key_jwk,signing_key_id,signature_algorithm,signer_fingerprint_sha256,approval_policy_id) VALUES($1,$2,$3,'REJECTED',$4,$5,$6::jsonb,$7,$8,$9,$10)`,[s.organizationId,b.lifecycleEventId,s.userId,b.comment||null,b.signature,JSON.stringify(signingKey.public_key_jwk),signingKey.id,signingKey.algorithm,signingKey.fingerprint_sha256,policy.id]);await c.query(`UPDATE user_signing_keys SET last_used_at=now() WHERE id=$1`,[signingKey.id]);await c.query(`UPDATE lifecycle_events SET status='REJECTED',approved_by=$1 WHERE id=$2 AND organization_id=$3`,[s.userId,b.lifecycleEventId,s.organizationId])});
  await appendAudit({organizationId:s.organizationId,actorUserId:s.userId,action:'LIFECYCLE_REJECT',entityType:'LIFECYCLE_EVENT',entityId:b.lifecycleEventId,metadata:{projectId:event.project_id,signerFingerprint:signingKey.fingerprint_sha256,policyId:policy.id}});
  return NextResponse.json({status:'REJECTED',signerFingerprint:signingKey.fingerprint_sha256});
 }
 const approvalState=await tx(async c=>{
   await c.query(`SELECT pg_advisory_xact_lock(hashtext($1))`,[`approval:${b.lifecycleEventId}`]);
   await c.query(`INSERT INTO approvals(organization_id,lifecycle_event_id,approver_user_id,decision,comment,signature,public_key_jwk,signing_key_id,signature_algorithm,signer_fingerprint_sha256,approval_policy_id,sequence_number) SELECT $1,$2,$3,'APPROVED',$4,$5,$6::jsonb,$7,$8,$9,$10,COALESCE(MAX(sequence_number),0)+1 FROM approvals WHERE lifecycle_event_id=$2 ON CONFLICT(lifecycle_event_id,approver_user_id) WHERE decision='APPROVED' DO NOTHING`,[s.organizationId,b.lifecycleEventId,s.userId,b.comment||null,b.signature,JSON.stringify(signingKey.public_key_jwk),signingKey.id,signingKey.algorithm,signingKey.fingerprint_sha256,policy.id]);
   await c.query(`UPDATE user_signing_keys SET last_used_at=now() WHERE id=$1`,[signingKey.id]);
   const count=await c.query<{n:number}>(`SELECT COUNT(DISTINCT approver_user_id)::int n FROM approvals WHERE lifecycle_event_id=$1 AND decision='APPROVED'`,[b.lifecycleEventId]);
   return{count:count.rows[0]?.n||0,required:Number(policy.approvals_required||1)};
 });
 await appendAudit({organizationId:s.organizationId,actorUserId:s.userId,action:'LIFECYCLE_APPROVAL_RECORDED',entityType:'LIFECYCLE_EVENT',entityId:b.lifecycleEventId,metadata:{projectId:event.project_id,approvalCount:approvalState.count,approvalsRequired:approvalState.required,signerFingerprint:signingKey.fingerprint_sha256,policyId:policy.id}});
 if(approvalState.count<approvalState.required)return NextResponse.json({status:'AWAITING_APPROVALS',approvalCount:approvalState.count,approvalsRequired:approvalState.required,signerFingerprint:signingKey.fingerprint_sha256});
 const record={organizationId:s.organizationId,projectId:event.project_id,assetId:event.asset_id,recordId:event.id,type:event.event_type,evidenceHash,timestamp:event.occurred_at.toISOString(),signer:`policy:${policy.id||'default'}:approvals:${approvalState.count}`,payloadHash:event.payload_sha256};
 const receipt=await getLedger().anchor(record);
 await tx(async c=>{await c.query(`SELECT pg_advisory_xact_lock(hashtext($1))`,[`anchor:${b.lifecycleEventId}`]);const current=await c.query(`SELECT status FROM lifecycle_events WHERE id=$1 AND organization_id=$2 FOR UPDATE`,[b.lifecycleEventId,s.organizationId]);if(current.rows[0]?.status==='VERIFIED')return;await c.query(`UPDATE lifecycle_events SET status='VERIFIED',approved_by=$1,evidence_package_sha256=$2,signer_address=$3,ledger_network=$4,ledger_tx_hash=$5,ledger_block_height=$6,anchored_at=$7 WHERE id=$8 AND organization_id=$9`,[s.userId,evidenceHash,record.signer,receipt.network,receipt.txHash,receipt.blockHeight,receipt.timestamp,b.lifecycleEventId,s.organizationId]);await c.query(`INSERT INTO ledger_records(organization_id,lifecycle_event_id,network,record_id,tx_hash,block_height,payload_hash,evidence_hash,signer_address,anchored_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT DO NOTHING`,[s.organizationId,b.lifecycleEventId,receipt.network,event.id,receipt.txHash,receipt.blockHeight,event.payload_sha256,evidenceHash,record.signer,receipt.timestamp])});
 await appendAudit({organizationId:s.organizationId,actorUserId:s.userId,action:'LIFECYCLE_APPROVAL_THRESHOLD_ANCHOR',entityType:'LIFECYCLE_EVENT',entityId:b.lifecycleEventId,metadata:{projectId:event.project_id,approvalCount:approvalState.count,approvalsRequired:approvalState.required,network:receipt.network,txHash:receipt.txHash,blockHeight:receipt.blockHeight,policyId:policy.id}});
 return NextResponse.json({status:'VERIFIED',receipt,evidenceHash,approvalCount:approvalState.count,approvalsRequired:approvalState.required,signerFingerprint:signingKey.fingerprint_sha256,signingKeyId:signingKey.id});
}catch(e:any){return NextResponse.json({error:e.message},{status:e.status||400})}}
