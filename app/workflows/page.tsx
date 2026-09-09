import OperationsConsole from '@/components/OperationsConsole';
import PasskeyApprovalQueue from '@/components/PasskeyApprovalQueue';
import {requirePageSession} from '@/lib/server/page-auth';
export const dynamic='force-dynamic';
export default async function Workflows(){await requirePageSession('/workflows',['SUPER_ADMIN','ORG_ADMIN','PROJECT_MANAGER','TECHNICIAN','INSPECTOR']);return <><div className="page-head"><div><div className="eyebrow">Operational Control Plane</div><h1 className="title">Register. Perform. Prove.</h1><p className="subtitle">Create infrastructure records, advance assets only through valid lifecycle states, attach server-verified evidence, enforce separation of duties and finalize approved proof as Digital Immutable Records.</p></div><span className="badge">LIVE OPERATIONS</span></div><OperationsConsole/><PasskeyApprovalQueue/></>}
