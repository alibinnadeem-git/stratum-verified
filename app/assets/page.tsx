import Link from 'next/link';
import {liveAssets} from '@/lib/server/live-views';
export const dynamic='force-dynamic';
const fmt=(d:Date|string|null)=>d?new Date(d).toLocaleDateString('en-US',{year:'numeric',month:'short',day:'numeric'}):'—';
export default async function Assets(){
 const assets=await liveAssets();
 return <><div className="page-head"><div><div className="eyebrow">Asset Registry · Live</div><h1 className="title">Asset passports</h1><p className="subtitle">Durable equipment identities backed by the live STRATUM Verified database and finalized STRATUM Chain proofs.</p></div><Link className="action" href="/workflows">+ Register / verify</Link></div>
 <div className="card table-card"><table className="table"><thead><tr><th>Asset</th><th>Manufacturer / Serial</th><th>System / Location</th><th>Lifecycle</th><th>Latest event</th><th>Proof</th></tr></thead><tbody>
 {assets.map(a=><tr key={a.id}><td><Link href={`/assets/${a.id}`}><strong>{a.name}</strong></Link><div className="muted">{a.asset_code} · {a.asset_type}</div></td><td>{a.manufacturer_name||'Manufacturer not recorded'}<div className="muted mono">{a.serial_number||'No serial'}</div></td><td>{a.system_name||'Unassigned system'}<div className="muted">{a.site_name} · {a.location_label||'Location pending'}</div></td><td><span className="status-chip">{a.status}</span><div className="muted">{a.project_code}</div></td><td>{a.latest_event_type||'No verified event'}<div className="muted">{fmt(a.anchored_at)}</div></td><td>{a.ledger_block_height?<span className="proof">✓ #{a.ledger_block_height}</span>:<span className="pending">Pending</span>}</td></tr>)}
 {!assets.length&&<tr><td colSpan={6}><div className="muted">No assets have been registered yet.</div></td></tr>}</tbody></table></div></>;
}