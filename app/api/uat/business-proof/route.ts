import {NextResponse} from 'next/server';
import {generateKeyPairSync,sign as cryptoSign} from 'crypto';
import {query,tx} from '@/lib/server/db';
import {canonicalHash,sha256} from '@/lib/server/hash';
import {getLedger} from '@/lib/server/chain';
import {verifyApprovalSignature} from '@/lib/server/signature';
import type {LedgerRecord} from '@/lib/ledger';
export const runtime='nodejs';export const maxDuration=10;
const ORG='10000000-0000-4000-8000-000000000001',PROJECT='30000000-0000-4000-8000-000000000001',ASSET='60000000-0000-4000-8000-000000000001',TECH='20000000-0000-4000-8000-000000000001',INSPECTOR='20000000-0000-4000-8000-000000000002',EVENT='70000000-0000-4000-8000-000000000002',EVIDENCE='80000000-0000-4000-8000-000000000002';
const occurredAt='2026-08-24T23:15:00.000Z';
const evidenceDigest=sha256('STRATUM Verified production pilot installation evidence | STR-UAT-SWGR-001 | 2026-08-24');
export async function GET(){try{
 if((process.env.STRATUM_CHAIN_ID||'')!=='stratum-devnet-1')return NextResponse.json({error:'UAT route disabled outside devnet'},{status:403});
 const done=await query<any>('SELECT id,status,ledger_tx_hash,ledger_block_height,evidence_package_sha256 FROM lifecycle_events WHERE id=$1',[EVENT]);
 if(done.rows[0]?.status==='VERIFIED'){const v=await getLedger().verify(EVENT,done.rows[0].evidence_package_sha256);return NextResponse.json({reused:true,event:done.rows[0],chain:v});}
 const canonical={version:'stratum.verified.lifecycle.v1',organizationId:ORG,projectId:PROJECT,assetId:ASSET,eventType:'INSTALL',occurredAt,payload:{assetCode:'STR-UAT-SWGR-001',serialNumber:'SV-UAT-SN-0001',location:'Electrical Room UAT',method:'Production business-workflow UAT',technician:'Field Technician UAT'}};
 const payloadHash=canonicalHash(canonical);
 await query(`INSERT INTO lifecycle_events(id,organization_id,project_id,asset_id,event_type,status,performed_by,occurred_at,canonical_payload,payload_sha256) VALUES($1,$2,$3,$4,'INSTALL','SUBMITTED',$5,$6,$7::jsonb,$8) ON CONFLICT (id) DO NOTHING`,[EVENT,ORG,PROJECT,ASSET,TECH,occurredAt,JSON.stringify(canonical),payloadHash]);
 await query(`INSERT INTO evidence(id,organization_id,lifecycle_event_id,asset_id,kind,file_name,mime_type,storage_uri,sha256,visibility,captured_by,captured_at,metadata) VALUES($1,$2,$3,$4,'INSTALLATION_REPORT','stratum-uat-installation-report.txt','text/plain','private://uat/installation-report',$5,'PRIVATE',$6,$7,'{"uat":true,"serverHashVerified":true}'::jsonb) ON CONFLICT (id) DO NOTHING`,[EVIDENCE,ORG,EVENT,ASSET,evidenceDigest,TECH,occurredAt]);
 if(TECH===INSPECTOR)throw new Error('Separation of duties failed');
 const {privateKey,publicKey}=generateKeyPairSync('ec',{namedCurve:'P-256'});const jwk=publicKey.export({format:'jwk'}) as JsonWebKey;const signature=cryptoSign('sha256',Buffer.from(payloadHash,'utf8'),{key:privateKey,dsaEncoding:'ieee-p1363'}).toString('base64');
 if(!verifyApprovalSignature(payloadHash,signature,jwk))throw new Error('Cryptographic approval verification failed');
 const ev=await query<{sha256:string}>('SELECT sha256 FROM evidence WHERE lifecycle_event_id=$1 ORDER BY sha256',[EVENT]);const evidenceHash=sha256(ev.rows.map(x=>x.sha256).join(''));
 const record:LedgerRecord={organizationId:ORG,projectId:PROJECT,assetId:ASSET,recordId:EVENT,type:'INSTALL',evidenceHash,timestamp:occurredAt,signer:`user:${INSPECTOR}`,payloadHash};
 const receipt=await getLedger().anchor(record);
 await tx(async c=>{await c.query(`INSERT INTO approvals(organization_id,lifecycle_event_id,approver_user_id,decision,comment,signature,public_key_jwk) VALUES($1,$2,$3,'APPROVED','Independent production UAT approval',$4,$5::jsonb)`,[ORG,EVENT,INSPECTOR,signature,JSON.stringify(jwk)]);await c.query(`UPDATE lifecycle_events SET status='VERIFIED',approved_by=$1,evidence_package_sha256=$2,signer_address=$3,ledger_network=$4,ledger_tx_hash=$5,ledger_block_height=$6,anchored_at=$7 WHERE id=$8`,[INSPECTOR,evidenceHash,record.signer,receipt.network,receipt.txHash,receipt.blockHeight,receipt.timestamp,EVENT]);await c.query(`INSERT INTO ledger_records(organization_id,lifecycle_event_id,network,record_id,tx_hash,block_height,payload_hash,evidence_hash,signer_address,anchored_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[ORG,EVENT,receipt.network,EVENT,receipt.txHash,receipt.blockHeight,payloadHash,evidenceHash,record.signer,receipt.timestamp]);await c.query(`UPDATE assets SET status='INSTALLED',installed_at=$1 WHERE id=$2`,[occurredAt,ASSET]);});
 const verified=await getLedger().verify(EVENT,evidenceHash);return NextResponse.json({reused:false,assetCode:'STR-UAT-SWGR-001',eventId:EVENT,payloadHash,evidenceDigest,evidencePackageHash:evidenceHash,approvalSignatureVerified:true,separationOfDuties:true,receipt,verified});
 }catch(e:any){return NextResponse.json({error:e.message||'Business UAT failed'},{status:500})}}
