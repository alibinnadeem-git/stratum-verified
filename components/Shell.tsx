import Link from 'next/link';
import type {ReactNode} from 'react';
import {requireSession,Session} from '@/lib/server/auth';
const authenticatedGroups=[
 {label:'Workspace',links:[['/','Overview'],['/twin','STRATUM Twin'],['/projects','Projects'],['/sites','Sites'],['/assets','Asset Passports']]},
 {label:'Operations',links:[['/operational-intelligence','Operational Intelligence'],['/workflows','Operational Workflow'],['/maintenance','Maintenance'],['/evidence','Evidence']]},
 {label:'Trust',links:[['/provenance','Provenance'],['/verify','Verify Record'],['/chain','DIRs Explorer']]},
 {label:'Security',links:[['/identity','My Security Identity']]}
];
const guestGroups=[{label:'Public',links:[['/','Overview'],['/verify','Verify Record'],['/chain','DIRs Explorer'],['/login','Sign in']]}];
export default async function Shell({children}:{children:ReactNode}){let session:Session|null=null;try{session=await requireSession()}catch{}const groups=session?[...authenticatedGroups,...(['SUPER_ADMIN','ORG_ADMIN'].includes(session.role)?[{label:'Platform',links:[['/admin','Admin & RBAC']]}]:[])]:guestGroups;const initials=session?.email?.slice(0,2).toUpperCase()||'SV';return <div className="shell"><aside className="sidebar"><Link href="/" className="brand">STRATUM <span>VERIFIED</span></Link><div className="network-pill"><i/> DIRs · {process.env.STRATUM_CHAIN_ID||'stratum-devnet-1'}</div><nav className="nav">{groups.map(g=><div className="nav-group" key={g.label}><small>{g.label}</small>{g.links.map(([href,label])=><Link href={href} key={href}>{label}</Link>)}</div>)}</nav><div className="usercard"><div className="avatar">{initials}</div><div>{session?<><strong>{session.email}</strong><small>{session.role.replaceAll('_',' ')}</small></>:<><strong>Public access</strong><small>Verification only</small></>}</div></div></aside><main className="main">{children}</main></div>}
