import Link from 'next/link';
import {accessibleProjectIds} from '@/lib/server/access';
import {liveMaintenance} from '@/lib/server/live-views';
import {requirePageSession} from '@/lib/server/page-auth';
export const dynamic='force-dynamic';
const date=(d:Date|string)=>new Date(d).toLocaleString('en-US',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'});

export default async function Maintenance(){
 const session=await requirePageSession('/maintenance');const ids=await accessibleProjectIds(session);const rows=await liveMaintenance(session.organizationId,ids);
 return <><div className="page-head"><div><div className="eyebrow">Lifecycle Management · Live</div><h1 className="title">Inspection, testing & maintenance history</h1><p className="subtitle">This view reflects actual lifecycle activity. Scheduling/work-order planning is kept separate from verified work so planned tasks are never presented as completed proof.</p></div><Link className="action" href="/workflows">+ Record field work</Link></div><div className="card table-card"><table className="table"><thead><tr><th>Work</th><th>Asset</th><th>Site / Project</th><th>Occurred</th><th>Evidence</th><th>Status / Proof</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td><strong>{r.event_type}</strong></td><td><Link href={`/assets/${r.asset_id}`}>{r.asset_code} · {r.asset_name}</Link></td><td>{r.site_name}<div className="muted">{r.project_code} · {r.project_name}</div></td><td>{date(r.occurred_at)}</td><td>{r.evidence_count}</td><td>{r.ledger_block_height?<span className="proof">✓ DIR #{r.ledger_block_height}</span>:<span className={r.status==='REJECTED'?'status-chip':'pending'}>{r.status}</span>}</td></tr>)}{!rows.length&&<tr><td colSpan={6}><div className="muted">No inspection, test, maintenance, repair or replacement lifecycle records have been created yet.</div></td></tr>}</tbody></table></div></>;
}
