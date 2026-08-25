import {canonicalHash} from './hash';
import {db} from './db';

export async function appendAudit(input:{organizationId:string;actorUserId?:string|null;action:string;entityType:string;entityId:string;metadata?:Record<string,unknown>;requestId?:string|null}){
  const c=await db().connect();
  try{
    await c.query('BEGIN');
    await c.query(`SELECT pg_advisory_xact_lock(hashtext($1))`,[`stratum-audit:${input.organizationId}`]);
    const prev=await c.query<{event_hash:string|null}>(`SELECT event_hash FROM audit_log WHERE organization_id=$1 AND event_hash IS NOT NULL ORDER BY id DESC LIMIT 1`,[input.organizationId]);
    const prevHash=prev.rows[0]?.event_hash||'GENESIS';
    const createdAt=new Date().toISOString();
    const payload={organizationId:input.organizationId,actorUserId:input.actorUserId||null,action:input.action,entityType:input.entityType,entityId:input.entityId,metadata:input.metadata||{},requestId:input.requestId||null,createdAt,prevHash};
    const eventHash=canonicalHash(payload);
    const r=await c.query(`INSERT INTO audit_log(organization_id,actor_user_id,action,entity_type,entity_id,metadata,created_at,prev_hash,event_hash,request_id) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10) RETURNING id,created_at,event_hash`,[input.organizationId,input.actorUserId||null,input.action,input.entityType,input.entityId,JSON.stringify(input.metadata||{}),createdAt,prevHash,eventHash,input.requestId||null]);
    await c.query('COMMIT');
    return r.rows[0];
  }catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
}

export async function verifyAuditChain(organizationId:string){
  const r=await db().query<any>(`SELECT id,actor_user_id,action,entity_type,entity_id,metadata,created_at,prev_hash,event_hash,request_id FROM audit_log WHERE organization_id=$1 AND event_hash IS NOT NULL ORDER BY id ASC`,[organizationId]);
  let prev='GENESIS';
  for(const row of r.rows){
    const payload={organizationId,actorUserId:row.actor_user_id||null,action:row.action,entityType:row.entity_type,entityId:row.entity_id,metadata:row.metadata||{},requestId:row.request_id||null,createdAt:new Date(row.created_at).toISOString(),prevHash:prev};
    const expected=canonicalHash(payload);
    if(row.prev_hash!==prev||row.event_hash!==expected)return{valid:false,checked:r.rows.length,brokenAtId:String(row.id),expected,actual:row.event_hash};
    prev=row.event_hash;
  }
  return{valid:true,checked:r.rows.length,head:prev};
}
