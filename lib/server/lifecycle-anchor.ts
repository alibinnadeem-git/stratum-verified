import {db} from './db';
import {getLedger} from './chain';
import type {LedgerRecord,AnchorReceipt} from '../ledger';
import type {LifecycleEventType} from '../workflow';

const assetStatus:Record<LifecycleEventType,string>={
 REGISTER_ASSET:'REGISTERED',PROCURE:'PROCURED',SHIP:'IN_TRANSIT',TRANSFER_CUSTODY:'IN_CUSTODY',RECEIVE:'RECEIVED',INSTALL:'INSTALLED',INSPECT:'INSPECTED',TEST:'TESTED',COMMISSION:'COMMISSIONED',ENERGIZE:'OPERATIONAL',MAINTAIN:'OPERATIONAL',REPAIR:'OPERATIONAL',REPLACE:'REPLACED',DECOMMISSION:'DECOMMISSIONED'
};

export async function anchorLifecycleOnce(input:{organizationId:string;lifecycleEventId:string;approvedBy:string;evidenceHash:string;record:LedgerRecord}){
 const c=await db().connect();const lockKey=`stratum-lifecycle-anchor:${input.lifecycleEventId}`;
 try{
  await c.query(`SELECT pg_advisory_lock(hashtext($1))`,[lockKey]);
  const current=await c.query<any>(`SELECT status,event_type::text,asset_id,occurred_at,ledger_network,ledger_tx_hash,ledger_block_height,anchored_at FROM lifecycle_events WHERE id=$1 AND organization_id=$2 LIMIT 1`,[input.lifecycleEventId,input.organizationId]);
  const row=current.rows[0];if(!row)throw Object.assign(new Error('Lifecycle event disappeared before anchoring'),{status:404});
  if(row.status==='VERIFIED')return{alreadyFinalized:true,receipt:{network:row.ledger_network,txHash:row.ledger_tx_hash,blockHeight:Number(row.ledger_block_height),timestamp:new Date(row.anchored_at).toISOString()} as AnchorReceipt};
  if(row.status==='REJECTED')throw Object.assign(new Error('Rejected lifecycle event cannot be anchored'),{status:409});
  const receipt=await getLedger().anchor(input.record);
  await c.query('BEGIN');
  try{
   await c.query(`UPDATE lifecycle_events SET status='VERIFIED',approved_by=$1,evidence_package_sha256=$2,signer_address=$3,ledger_network=$4,ledger_tx_hash=$5,ledger_block_height=$6,anchored_at=$7 WHERE id=$8 AND organization_id=$9`,[input.approvedBy,input.evidenceHash,input.record.signer,receipt.network,receipt.txHash,receipt.blockHeight,receipt.timestamp,input.lifecycleEventId,input.organizationId]);
   await c.query(`INSERT INTO ledger_records(organization_id,lifecycle_event_id,network,record_id,tx_hash,block_height,payload_hash,evidence_hash,signer_address,anchored_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT DO NOTHING`,[input.organizationId,input.lifecycleEventId,receipt.network,input.record.recordId,receipt.txHash,receipt.blockHeight,input.record.payloadHash||null,input.evidenceHash,input.record.signer,receipt.timestamp]);

   if(row.event_type==='INSTALL')await c.query(`UPDATE assets SET installed_at=CASE WHEN installed_at IS NULL OR installed_at>$1 THEN $1 ELSE installed_at END WHERE id=$2 AND organization_id=$3`,[row.occurred_at,row.asset_id,input.organizationId]);
   if(row.event_type==='COMMISSION')await c.query(`UPDATE assets SET commissioned_at=CASE WHEN commissioned_at IS NULL OR commissioned_at>$1 THEN $1 ELSE commissioned_at END WHERE id=$2 AND organization_id=$3`,[row.occurred_at,row.asset_id,input.organizationId]);
   const latest=await c.query<{event_type:LifecycleEventType}>(`SELECT event_type::text AS event_type FROM lifecycle_events WHERE organization_id=$1 AND asset_id=$2 AND status='VERIFIED' ORDER BY occurred_at DESC,anchored_at DESC NULLS LAST LIMIT 1`,[input.organizationId,row.asset_id]);
   const latestType=latest.rows[0]?.event_type;
   if(latestType&&assetStatus[latestType])await c.query(`UPDATE assets SET status=$1 WHERE id=$2 AND organization_id=$3`,[assetStatus[latestType],row.asset_id,input.organizationId]);
   await c.query('COMMIT');
  }catch(e){await c.query('ROLLBACK');throw e}
  return{alreadyFinalized:false,receipt};
 }finally{
  try{await c.query(`SELECT pg_advisory_unlock(hashtext($1))`,[lockKey])}catch{}
  c.release();
 }
}
