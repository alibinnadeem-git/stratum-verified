import {db} from './db';
import {getLedger} from './chain';
import type {LedgerRecord,AnchorReceipt} from '../ledger';

export async function anchorLifecycleOnce(input:{organizationId:string;lifecycleEventId:string;approvedBy:string;evidenceHash:string;record:LedgerRecord}){
 const c=await db().connect();const lockKey=`stratum-lifecycle-anchor:${input.lifecycleEventId}`;
 try{
  await c.query(`SELECT pg_advisory_lock(hashtext($1))`,[lockKey]);
  const current=await c.query<any>(`SELECT status,ledger_network,ledger_tx_hash,ledger_block_height,anchored_at FROM lifecycle_events WHERE id=$1 AND organization_id=$2 LIMIT 1`,[input.lifecycleEventId,input.organizationId]);
  const row=current.rows[0];if(!row)throw Object.assign(new Error('Lifecycle event disappeared before anchoring'),{status:404});
  if(row.status==='VERIFIED')return{alreadyFinalized:true,receipt:{network:row.ledger_network,txHash:row.ledger_tx_hash,blockHeight:Number(row.ledger_block_height),timestamp:new Date(row.anchored_at).toISOString()} as AnchorReceipt};
  if(row.status==='REJECTED')throw Object.assign(new Error('Rejected lifecycle event cannot be anchored'),{status:409});
  const receipt=await getLedger().anchor(input.record);
  await c.query('BEGIN');
  try{
   await c.query(`UPDATE lifecycle_events SET status='VERIFIED',approved_by=$1,evidence_package_sha256=$2,signer_address=$3,ledger_network=$4,ledger_tx_hash=$5,ledger_block_height=$6,anchored_at=$7 WHERE id=$8 AND organization_id=$9`,[input.approvedBy,input.evidenceHash,input.record.signer,receipt.network,receipt.txHash,receipt.blockHeight,receipt.timestamp,input.lifecycleEventId,input.organizationId]);
   await c.query(`INSERT INTO ledger_records(organization_id,lifecycle_event_id,network,record_id,tx_hash,block_height,payload_hash,evidence_hash,signer_address,anchored_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT DO NOTHING`,[input.organizationId,input.lifecycleEventId,receipt.network,input.record.recordId,receipt.txHash,receipt.blockHeight,input.record.payloadHash||null,input.evidenceHash,input.record.signer,receipt.timestamp]);
   await c.query('COMMIT');
  }catch(e){await c.query('ROLLBACK');throw e}
  return{alreadyFinalized:false,receipt};
 }finally{
  try{await c.query(`SELECT pg_advisory_unlock(hashtext($1))`,[lockKey])}catch{}
  c.release();
 }
}
