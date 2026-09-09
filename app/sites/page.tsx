import Link from 'next/link';
import {accessibleProjectIds} from '@/lib/server/access';
import {liveSites} from '@/lib/server/live-views';
import {requirePageSession} from '@/lib/server/page-auth';
export const dynamic='force-dynamic';

export default async function Sites(){
 const session=await requirePageSession('/sites');const ids=await accessibleProjectIds(session);const sites=await liveSites(session.organizationId,ids);
 return <><div className="page-head"><div><div className="eyebrow">Project Geography · Live</div><h1 className="title">Sites</h1><p className="subtitle">Physical locations roll systems, assets, pending field activity and finalized lifecycle proof into one project-scoped view.</p></div><Link className="action" href="/workflows">+ New site</Link></div><div className="grid kpis">{sites.map((s,i)=><div className="card" key={s.id}><div className="label">Site {String(i+1).padStart(2,'0')} · {s.project_code}</div><h3>{s.name}</h3><p className="muted">{s.project_name}<br/>{s.address||'Site address pending'}</p><div className="project-kpis"><div><strong>{s.asset_count}</strong><span>Assets</span></div><div><strong>{s.system_count}</strong><span>Systems</span></div><div><strong>{s.pending_event_count}</strong><span>Pending</span></div></div><p className="muted" style={{marginTop:12}}>{s.verified_event_count} finalized lifecycle event(s)</p></div>)}{!sites.length&&<div className="card"><h3>No sites available</h3><p className="muted">Create a site under an accessible project from Operational Workflow.</p></div>}</div></>;
}
