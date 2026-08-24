import Link from 'next/link';
import type {ReactNode} from 'react';
import {demoSession} from '@/lib/auth/session';
const groups=[
 {label:'Workspace',links:[['/','Overview'],['/twin','STRATUM Twin'],['/projects','Projects'],['/sites','Sites'],['/assets','Asset Passports']]},
 {label:'Operations',links:[['/workflows','Install & Commission'],['/maintenance','Maintenance'],['/evidence','Evidence']]},
 {label:'Trust',links:[['/provenance','Provenance'],['/verify','Verify Record'],['/chain','Chain Explorer']]},
 {label:'Platform',links:[['/admin','Admin & RBAC']]}
];
export default function Shell({children}:{children:ReactNode}){return <div className="shell"><aside className="sidebar"><Link href="/" className="brand">STRATUM <span>VERIFIED</span></Link><div className="network-pill"><i/> {process.env.STRATUM_CHAIN_ID||'stratum-devnet-1'}</div><nav className="nav">{groups.map(g=><div className="nav-group" key={g.label}><small>{g.label}</small>{g.links.map(([href,label])=><Link href={href} key={href}>{label}</Link>)}</div>)}</nav><div className="usercard"><div className="avatar">AB</div><div><strong>{demoSession.user.name}</strong><small>{demoSession.role.replaceAll('_',' ')}</small></div></div></aside><main className="main">{children}</main></div>}
