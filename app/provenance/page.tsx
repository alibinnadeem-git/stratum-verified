import Link from 'next/link';
import {accessibleProjectIds} from '@/lib/server/access';
import {liveProvenance} from '@/lib/server/live-views';
import {requirePageSession} from '@/lib/server/page-auth';
export const dynamic='force-dynamic';
const core=['REGISTER_ASSET','RECEIVE','INSTALL','INSPECT','TEST','COMMISSION'];
const label:Record<string,string>={REGISTER_ASSET:'Registered',RECEIVE:'Received',INSTALL:'Installed',INSPECT:'Inspected',TEST:'Tested',COMMISSION:'Commissioned'};

export default async function Provenance(){
 const session=await requirePageSession('/provenance');
 const ids=await accessibleProjectIds(session);
 const assets=await liveProvenance(session.organizationId,ids);
 return <>
  <div className="page-head"><div><div className="eyebrow">Trust Layer · Live</div><h1 className="title">Material & asset provenance</h1><p className="subtitle">Completeness below is calculated only from verified lifecycle milestones. Missing proof stays visible as missing; later events do not rewrite the historical record shown here.</p></div><Link className="action" href="/workflows">Advance lifecycle</Link></div>
  <div className="card provenance-map"><div className="prov-step active"><i>01</i><b>Registered</b><span>Identity established</span></div><em>→</em><div className="prov-step active"><i>02</i><b>Received</b><span>Physical identity confirmed</span></div><em>→</em><div className="prov-step active"><i>03</i><b>Installed</b><span>Field placement recorded</span></div><em>→</em><div className="prov-step active"><i>04</i><b>Inspected & Tested</b><span>Independent QA evidence</span></div><em>→</em><div className="prov-step active"><i>05</i><b>Commissioned</b><span>Ready for operations</span></div></div>
  <div className="card table-card"><table className="table"><thead><tr><th>Asset</th><th>Manufacturer / Serial</th><th>Verified core milestones</th><th>Completeness</th><th>Latest proof</th></tr></thead><tbody>
   {assets.map(a=>{const complete=core.filter(x=>a.verified_event_types.includes(x));const pct=Math.round(complete.length/core.length*100);return <tr key={a.id}><td><Link href={`/assets/${a.id}`}><strong>{a.name}</strong></Link><div className="muted">{a.asset_code} · {a.project_code}</div></td><td>{a.manufacturer_name||'Manufacturer not recorded'}<div className="muted mono">{a.serial_number||'No serial'}</div></td><td><div className="muted">{complete.length?complete.map(x=>label[x]).join(' · '):'No verified core milestone yet'}</div></td><td><strong>{pct}%</strong><div className="progress"><i style={{width:`${pct}%`}}/></div></td><td>{a.ledger_block_height?<span className="proof">✓ DIR #{a.ledger_block_height}</span>:<span className="pending">Pending</span>}<div className="muted">{a.latest_event_type||'No verified event'}</div></td></tr>})}
   {!assets.length&&<tr><td colSpan={5}><div className="muted">No assets are available in your accessible projects.</div></td></tr>}
  </tbody></table></div>
 </>;
}
