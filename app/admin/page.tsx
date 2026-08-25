import AdminConsole from '@/components/AdminConsole';
import ComplianceConsole from '@/components/ComplianceConsole';
import {can} from '@/lib/auth/permissions';
import {requireSession} from '@/lib/server/auth';
export const dynamic='force-dynamic';
const roles=['SUPER_ADMIN','ORG_ADMIN','PROJECT_MANAGER','TECHNICIAN','INSPECTOR','CLIENT','VIEWER'] as const;
export default async function Admin(){await requireSession(['SUPER_ADMIN','ORG_ADMIN']);return <><div className="eyebrow">Platform Administration</div><h1 className="title">Identity, RBAC, governance & security</h1><p className="subtitle">Organization and project-scoped administration with session revocation, durable signing identities, separation of duties, approval policy governance and tamper-evident privileged-action history.</p><div className="card table-card" style={{marginBottom:16}}><h3>Role capabilities</h3><table className="table"><thead><tr><th>Role</th><th>Create event</th><th>Approve</th><th>Upload evidence</th><th>Manage org</th></tr></thead><tbody>{roles.map(r=><tr key={r}><td><strong>{r.replaceAll('_',' ')}</strong></td><td>{can(r,'EVENT_CREATE')?'✓':'—'}</td><td>{can(r,'EVENT_APPROVE')?'✓':'—'}</td><td>{can(r,'EVIDENCE_UPLOAD')?'✓':'—'}</td><td>{can(r,'ORG_MANAGE')?'✓':'—'}</td></tr>)}</tbody></table></div><AdminConsole/><ComplianceConsole/></>}
