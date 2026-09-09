import Link from 'next/link';
import {accessibleProjectIds} from '@/lib/server/access';
import {liveProjects} from '@/lib/server/live-views';
import {requirePageSession} from '@/lib/server/page-auth';
export const dynamic='force-dynamic';

export default async function Projects(){
 const session=await requirePageSession('/projects');const ids=await accessibleProjectIds(session);const projects=await liveProjects(session.organizationId,ids);
 return <><div className="page-head"><div><div className="eyebrow">Portfolio · Live</div><h1 className="title">Projects</h1><p className="subtitle">Project totals are calculated from the organization-scoped asset registry and verified lifecycle records available to your role.</p></div><Link className="action" href="/workflows">+ New project</Link></div><div className="project-grid">{projects.map(p=>{const progress=p.asset_count?Math.round(p.verified_asset_count/p.asset_count*100):0;return <div className="card project-card" key={p.id}><div className="project-status">{p.status}</div><div className="eyebrow">{p.project_code}</div><h2>{p.name}</h2><p className="muted">{p.client_name||'Client not recorded'}<br/>{p.address||'Project address pending'}</p><div className="progress"><i style={{width:`${progress}%`}}/></div><div className="project-kpis"><div><strong>{progress}%</strong><span>Asset proof coverage</span></div><div><strong>{p.asset_count}</strong><span>Assets</span></div><div><strong>{p.pending_event_count}</strong><span>Pending</span></div></div><p className="muted" style={{marginTop:12}}>{p.site_count} site(s) · {p.verified_event_count} finalized lifecycle event(s)</p></div>})}{!projects.length&&<div className="card"><h3>No accessible projects</h3><p className="muted">Create a project from the operational workflow or ask an administrator to assign project access.</p></div>}</div></>;
}
