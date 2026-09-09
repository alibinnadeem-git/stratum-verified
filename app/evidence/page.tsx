import Link from 'next/link';
import {accessibleProjectIds} from '@/lib/server/access';
import {liveEvidence} from '@/lib/server/live-views';
import {requirePageSession} from '@/lib/server/page-auth';
export const dynamic='force-dynamic';
const short=(s:string,n=14)=>s.length>n*2?`${s.slice(0,n)}…${s.slice(-n)}`:s;
const date=(d:Date|string|null)=>d?new Date(d).toLocaleString('en-US',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'}):'—';

export default async function Evidence(){
 const session=await requirePageSession('/evidence');const ids=await accessibleProjectIds(session);const evidence=await liveEvidence(session.organizationId,ids);
 return <><div className="page-head"><div><div className="eyebrow">Evidence Vault · Live</div><h1 className="title">Private files. Verifiable fingerprints.</h1><p className="subtitle">Evidence is stored inside the authorized organization workspace. Server-calculated SHA-256 fingerprints bind each file to a lifecycle event without publishing the source file into DIRs.</p></div><Link className="action" href="/workflows">+ Add evidence to workflow</Link></div><div className="card notice"><strong>Evidence is contextual</strong><span>Upload evidence from Operational Workflow after creating the lifecycle event it supports. This prevents unattached files from becoming ambiguous proof.</span></div><div className="card table-card"><table className="table"><thead><tr><th>Evidence</th><th>Asset / Project</th><th>Lifecycle</th><th>SHA-256</th><th>Visibility</th><th>Proof</th></tr></thead><tbody>{evidence.map(e=><tr key={e.id}><td><strong>{e.file_name||e.kind}</strong><div className="muted">{e.kind} · {date(e.captured_at)}</div></td><td><Link href={`/assets/${e.asset_id}`}><strong>{e.asset_code} · {e.asset_name}</strong></Link><div className="muted">{e.project_code}</div></td><td>{e.event_type}<div className="muted">{e.event_status}</div></td><td className="mono" title={e.sha256}>{short(e.sha256)}</td><td>{e.visibility}</td><td>{e.ledger_block_height?<span className="proof">✓ DIR #{e.ledger_block_height}</span>:<span className="pending">Pending</span>}</td></tr>)}{!evidence.length&&<tr><td colSpan={6}><div className="muted">No evidence is available in your accessible projects yet.</div></td></tr>}</tbody></table></div></>;
}
