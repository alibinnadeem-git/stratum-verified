import {query,tx} from './db';
import {verifyAuditChain} from './audit';
import {getLedger} from './chain';
import type {LedgerRecord} from '../ledger';

export async function anchorAuditHead(organizationId:string,actorUserId?:string|null){
 const integrity=await verifyAuditChain(organizationId);if(!integrity.valid)throw Object.assign(new Error(`Audit chain integrity failure at ${integrity.brokenAtId}`),{status:409});
 if(!integrity.checked||!integrity.head||integrity.head==='GENESIS')return{status:'EMPTY'} as const;
 const head=await query<any>(`SELECT id,event_hash,created_at FROM audit_log WHERE organization_id=$1 AND event_hash=$2 ORDER BY id DESC LIMIT 1`,[organizationId,integrity.head]);const event=head.rows[0];if(!event)throw new Error('Audit head could not be resolved');
 const existing=await query<any>(`SELECT * FROM audit_anchors WHERE organization_id=$1 AND audit_event_id=$2 LIMIT 1`,[organizationId,event.id]);if(existing.rows[0])return{status:'ALREADY_ANCHORED',anchor:existing.rows[0]} as const;
 const record:LedgerRecord={organizationId,projectId:`audit:${organizationId}`,assetId:`audit:${organizationId}`,recordId:`audit-root:${event.id}`,type:'AUDIT_ROOT',evidenceHash:integrity.head,timestamp:new Date(event.created_at).toISOString(),signer:'STRATUM_AUDIT_ROOT',payloadHash:integrity.head};
 const receipt=await getLedger().anchor(record);
 const saved=await tx(async c=>{const r=await c.query(`INSERT INTO audit_anchors(organization_id,audit_event_id,audit_head_hash,ledger_network,ledger_record_id,ledger_tx_hash,ledger_block_height,anchored_at,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(organization_id,audit_event_id) DO UPDATE SET ledger_tx_hash=EXCLUDED.ledger_tx_hash RETURNING *`,[organizationId,event.id,integrity.head,receipt.network,record.recordId,receipt.txHash,receipt.blockHeight,receipt.timestamp,actorUserId||null]);return r.rows[0]});
 return{status:'ANCHORED',anchor:saved,receipt} as const;
}
