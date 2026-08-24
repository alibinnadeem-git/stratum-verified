import TwinWorkspace,{TwinAsset} from '@/components/TwinWorkspace';
import {liveAssets} from '@/lib/server/live-views';

export const dynamic='force-dynamic';

export default async function TwinPage(){
  const rows=await liveAssets();
  const assets:TwinAsset[]=rows.map(a=>({
    id:a.id,asset_code:a.asset_code,asset_type:a.asset_type,name:a.name,model:a.model,serial_number:a.serial_number,location_label:a.location_label,status:a.status,project_code:a.project_code,project_name:a.project_name,site_name:a.site_name,system_name:a.system_name,manufacturer_name:a.manufacturer_name,latest_event_type:a.latest_event_type,ledger_network:a.ledger_network,ledger_tx_hash:a.ledger_tx_hash,ledger_block_height:a.ledger_block_height
  }));
  return <>
    <div className="page-head"><div><div className="eyebrow">STRATUM Twin · Design → Build → Verify → Operate</div><h1 className="title">The verifiable digital twin of physical infrastructure.</h1><p className="subtitle">Submit a GLB/GLTF design, inspect its geometry in real time, bind every meaningful equipment object to a durable STRATUM Verified asset identity, and route approved lifecycle proof to STRATUM Chain. Model files and private evidence remain off-chain; only cryptographic proof crosses the trust boundary.</p></div><div className="badge">● STRATUM Chain · hashes only</div></div>
    <TwinWorkspace assets={assets} referenceModelUrl={process.env.NEXT_PUBLIC_STRATUM_TWIN_REFERENCE_MODEL_URL}/>
    <div className="card" style={{marginTop:16}}><div className="eyebrow">Trust architecture</div><div className="provenance-map"><div className="prov-step active"><i>L1</i><b>Physical Infrastructure</b><span>QR · NFC · Serial · Installed equipment</span></div><em>→</em><div className="prov-step active"><i>L2</i><b>STRATUM Twin</b><span>Spatial model · systems · asset relationships</span></div><em>→</em><div className="prov-step active"><i>L3</i><b>STRATUM Verified</b><span>Asset identity · evidence · lifecycle records</span></div><em>→</em><div className="prov-step active"><i>L4</i><b>LedgerAdapter</b><span>Canonical hashes only</span></div><em>→</em><div className="prov-step active"><i>L5</i><b>STRATUM Chain</b><span>Immutable proof · validator consensus</span></div></div></div>
  </>;
}
