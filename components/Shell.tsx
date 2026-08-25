import Link from 'next/link';
import type {ReactNode} from 'react';
import {readSession} from '@/lib/server/auth';
const baseGroups=[
 {label:'Workspace',links:[['/','Overview'],['/twin','STRATUM Twin'],['/projects','Projects'],['/sites','Sites'],['/assets','Asset Passports']]},
 {label:'Operations',links:[['/workflows','Install & Commission'],['/maintenance','Maintenance'],['/evidence','Evidence']]},
 {label:'Trust',links:[['/provenance','Provenance'],['/verify','Verify Record'],['/chain','Chain Explorer']]},
 {label:'Security',links:[['/identity','My Signing Identity']]}
];
export default async function Shell({children}:{children:ReactNode}){const session=await readSession();const groups=[...baseGroups,...(session&&['SUPER_ADMIN','ORG_ADMIN'].includes(session.role)?[{label:'Platform',links:[['/admin','Admin & RBAC']]}]:[])];const initials=session?.email?.slice(0,2).toUpperCase()||'SV';return <div className="shell"><aside className="sidebar"><Link href="/" className="brand">STRATUM <span>VERIFIED</span></Link><div className="network-pill"><i/> {process.env.STRATUM_CHAIN_ID||'stratum-devnet-1'}</div><nav className="nav">{groups.map(g=><div className="nav-group" key={g.label}><small>{g.label}</small>{g.links.map(([href,label])=><Link href={href} key={href}>{label}</Link>)}</div>)}</nav><div className="usercard"><div className="avatar">{initials}</div><div>{session?<><strong>{session.email}</strong><small>{session.role.replaceAll('_',' ')}</small></>:<><strong>Guest</strong><small><Link href="/login">Sign in</Link></small></>}</div></div></aside><main className="main">{children}</main></div>}
