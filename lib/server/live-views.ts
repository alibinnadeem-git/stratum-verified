import {query} from './db';

export type LiveAssetRow={
  id:string;asset_code:string;asset_type:string;name:string;model:string|null;serial_number:string|null;location_label:string|null;status:string;qr_token:string;specifications:Record<string,unknown>;installed_at:Date|null;commissioned_at:Date|null;warranty_expires_at:Date|null;project_code:string;project_name:string;site_name:string;system_name:string|null;manufacturer_name:string|null;latest_event_id:string|null;latest_event_type:string|null;latest_event_status:string|null;ledger_network:string|null;ledger_tx_hash:string|null;ledger_block_height:string|null;anchored_at:Date|null;};

export async function liveAssets(){
  const r=await query<LiveAssetRow>(`SELECT a.id,a.asset_code,a.asset_type,a.name,a.model,a.serial_number,a.location_label,a.status,a.qr_token::text,a.specifications,a.installed_at,a.commissioned_at,a.warranty_expires_at,p.project_code,p.name project_name,si.name site_name,sy.name system_name,m.name manufacturer_name,le.id::text latest_event_id,le.event_type::text latest_event_type,le.status::text latest_event_status,le.ledger_network,le.ledger_tx_hash,le.ledger_block_height::text,le.anchored_at FROM assets a JOIN projects p ON p.id=a.project_id JOIN sites si ON si.id=a.site_id LEFT JOIN systems sy ON sy.id=a.system_id LEFT JOIN manufacturers m ON m.id=a.manufacturer_id LEFT JOIN LATERAL (SELECT x.* FROM lifecycle_events x WHERE x.asset_id=a.id AND x.status='VERIFIED' ORDER BY x.anchored_at DESC NULLS LAST,x.occurred_at DESC LIMIT 1) le ON true ORDER BY COALESCE(le.anchored_at,a.created_at) DESC LIMIT 500`);
  return r.rows;
}

export async function liveAsset(identifier:string){
  const r=await query<LiveAssetRow>(`SELECT a.id,a.asset_code,a.asset_type,a.name,a.model,a.serial_number,a.location_label,a.status,a.qr_token::text,a.specifications,a.installed_at,a.commissioned_at,a.warranty_expires_at,p.project_code,p.name project_name,si.name site_name,sy.name system_name,m.name manufacturer_name,le.id::text latest_event_id,le.event_type::text latest_event_type,le.status::text latest_event_status,le.ledger_network,le.ledger_tx_hash,le.ledger_block_height::text,le.anchored_at FROM assets a JOIN projects p ON p.id=a.project_id JOIN sites si ON si.id=a.site_id LEFT JOIN systems sy ON sy.id=a.system_id LEFT JOIN manufacturers m ON m.id=a.manufacturer_id LEFT JOIN LATERAL (SELECT x.* FROM lifecycle_events x WHERE x.asset_id=a.id AND x.status='VERIFIED' ORDER BY x.anchored_at DESC NULLS LAST,x.occurred_at DESC LIMIT 1) le ON true WHERE a.id::text=$1 OR a.asset_code=$1 LIMIT 1`,[identifier]);
  return r.rows[0]||null;
}

export async function assetLifecycle(assetId:string){
  const r=await query<any>(`SELECT le.id::text,le.event_type::text,le.status::text,le.occurred_at,le.payload_sha256,le.evidence_package_sha256,le.ledger_network,le.ledger_tx_hash,le.ledger_block_height::text,le.anchored_at,performer.display_name performed_by_name,approver.display_name approved_by_name,(SELECT count(*)::int FROM evidence ev WHERE ev.lifecycle_event_id=le.id) evidence_count FROM lifecycle_events le LEFT JOIN users performer ON performer.id=le.performed_by LEFT JOIN users approver ON approver.id=le.approved_by WHERE le.asset_id=$1 ORDER BY le.occurred_at DESC`,[assetId]);
  return r.rows;
}

export async function publicEvidence(assetId:string){
  const r=await query<any>(`SELECT ev.id::text,ev.kind,ev.sha256,ev.visibility,ev.captured_at FROM evidence ev WHERE ev.asset_id=$1 ORDER BY ev.captured_at DESC NULLS LAST,ev.created_at DESC`,[assetId]);
  return r.rows;
}

export async function recentChain(){
  const [state,blocks]=await Promise.all([
    query<any>(`SELECT chain_id,height::text,latest_block_hash,genesis_hash,updated_at FROM sv_chain_state WHERE chain_id=$1`,[process.env.STRATUM_CHAIN_ID||'stratum-devnet-1']),
    query<any>(`SELECT b.height::text,b.block_hash,b.prev_hash,b.tx_hash,b.proposer_validator_id,b.finalized_at,b.votes_json,t.record_id,t.event_type,t.asset_id,t.evidence_hash,t.payload_hash FROM sv_chain_blocks b LEFT JOIN sv_chain_transactions t ON t.chain_id=b.chain_id AND t.tx_hash=b.tx_hash WHERE b.chain_id=$1 ORDER BY b.height DESC LIMIT 25`,[process.env.STRATUM_CHAIN_ID||'stratum-devnet-1'])
  ]);
  return {state:state.rows[0]||null,blocks:blocks.rows};
}
