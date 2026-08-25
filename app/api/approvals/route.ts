import {NextResponse} from 'next/server';
import {z} from 'zod';
import {requireSession} from '@/lib/server/auth';
import {query,tx} from '@/lib/server/db';
import {sha256} from '@/lib/server/hash';
import {getLedger} from '@/lib/server/chain';
import {verifyApprovalSignature} from '@/lib/server/signature';

const Body=z.object({lifecycleEventId:z.string().uuid(),decision:z.enum(['APPROVED','REJECTED']),comment:z.string().max(1000).optional(),signature:z.string().min(16),signingKeyId:z.string().uuid()});

export async function POST(req:Request){try{
 const s=await requireSession(['SUPER_ADMIN','ORG_ADMIN','PROJECT_MANAGER','INSPECTOR']);
 const b=Body.parse(await req.json());
 const e=await query<any>(`SELECT le.*,COALESCE(string_agg(ev.sha256,'' ORDER BY ev.sha256),'') evidence_concat FROM lifecycle_events le LEFT JOIN evidence ev ON ev.lifecycle_event_id=le.id WHERE le.id=$1 AND le.organization_id=$2 GROUP BY le.id`,[b.lifecycleEventId,s.organizationId]);
 const event=e.rows[0];if(!event)return NextResponse.json({error:'Lifecycle event not found'},{status:404});
 if(event.performed_by===s.userId)return NextResponse.json({error:'Separation of duties: performer cannot approve the same lifecycle event.'},{status:409});
 const k=await query<{id:string;public_key_jwk:JsonWebKey;fingerprint_sha256:string;algorithm:string}>(`SELECT id,public_key_jwk,fingerprint_sha256,algorithm FROM user_signing_keys WHERE id=$1 AND organization_id=$2 AND user_id=$3 AND revoked_at IS NULL LIMIT 1`,[b.signingKeyId,s.organizationId,s.userId]);
 const signingKey=k.rows[0];if(!signingKey)return NextResponse.json({error:'Registered active signing key not found for this user.'},{status:422});
 if(!verifyApprovalSignature(event.payload_sha256,b.signature,signingKey.public_key_jwk))return NextResponse.json({error:'Approval signature could not be verified against the registered signing identity.'},{status:422});
 const evidenceHash=sha256(event.evidence_concat||'');
 if(b.decision==='REJECTED'){
  await tx(async c=>{await c.query(`INSERT INTO approvals(organization_id,lifecycle_event_id,approver_user_id,decision,comment,signature,public_key_jwk,signing_key_id,signature_algorithm,signer_fingerprint_sha256) VALUES($1,$2,$3,'REJECTED',$4,$5,$6::jsonb,$7,$8,$9)`,[s.organizationId,b.lifecycleEventId,s.userId,b.comment||null,b.signature,JSON.stringify(signingKey.public_key_jwk),signingKey.id,signingKey.algorithm,signingKey.fingerprint_sha256]);await c.query(`UPDATE user_signing_keys SET last_used_at=now() WHERE id=$1`,[signingKey.id]);await c.query(`UPDATE lifecycle_events SET status='REJECTED',approved_by=$1 WHERE id=$2`,[s.userId,b.lifecycleEventId]);await c.query(`INSERT INTO audit_log(organization_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,'LIFECYCLE_REJECT','LIFECYCLE_EVENT',$3,$4::jsonb)`,[s.organizationId,s.userId,b.lifecycleEventId,JSON.stringify({signerFingerprint:signingKey.fingerprint_sha256})])});
  return NextResponse.json({status:'REJECTED',signerFingerprint:signingKey.fingerprint_sha256});
 }
 const record={organizationId:s.organizationId,projectId:event.project_id,assetId:event.asset_id,recordId:event.id,type:event.event_type,evidenceHash,timestamp:event.occurred_at.toISOString(),signer:`user:${s.userId}:key:${signingKey.fingerprint_sha256}`,payloadHash:event.payload_sha256};
 const receipt=await getLedger().anchor(record);
 await tx(async c=>{await c.query(`INSERT INTO approvals(organization_id,lifecycle_event_id,approver_user_id,decision,comment,signature,public_key_jwk,signing_key_id,signature_algorithm,signer_fingerprint_sha256) VALUES($1,$2,$3,'APPROVED',$4,$5,$6::jsonb,$7,$8,$9)`,[s.organizationId,b.lifecycleEventId,s.userId,b.comment||null,b.signature,JSON.stringify(signingKey.public_key_jwk),signingKey.id,signingKey.algorithm,signingKey.fingerprint_sha256]);await c.query(`UPDATE user_signing_keys SET last_used_at=now() WHERE id=$1`,[signingKey.id]);await c.query(`UPDATE lifecycle_events SET status='VERIFIED',approved_by=$1,evidence_package_sha256=$2,signer_address=$3,ledger_network=$4,ledger_tx_hash=$5,ledger_block_height=$6,anchored_at=$7 WHERE id=$8`,[s.userId,evidenceHash,record.signer,receipt.network,receipt.txHash,receipt.blockHeight,receipt.timestamp,b.lifecycleEventId]);await c.query(`INSERT INTO ledger_records(organization_id,lifecycle_event_id,network,record_id,tx_hash,block_height,payload_hash,evidence_hash,signer_address,anchored_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[s.organizationId,b.lifecycleEventId,receipt.network,event.id,receipt.txHash,receipt.blockHeight,event.payload_sha256,evidenceHash,record.signer,receipt.timestamp]);await c.query(`INSERT INTO audit_log(organization_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,'LIFECYCLE_APPROVE_AND_ANCHOR','LIFECYCLE_EVENT',$3,$4::jsonb)`,[s.organizationId,s.userId,b.lifecycleEventId,JSON.stringify({signerFingerprint:signingKey.fingerprint_sha256,network:receipt.network,txHash:receipt.txHash,blockHeight:receipt.blockHeight})])});
 return NextResponse.json({status:'VERIFIED',receipt,evidenceHash,signerFingerprint:signingKey.fingerprint_sha256,signingKeyId:signingKey.id});
}catch(e:any){return NextResponse.json({error:e.message},{status:e.status||400})}}
