import SigningIdentityPanel from '@/components/SigningIdentityPanel';
import PasswordPanel from '@/components/PasswordPanel';
import {requireSession} from '@/lib/server/auth';
export default async function IdentityPage(){await requireSession();return <><div className="eyebrow">Personal Security</div><h1 className="title">My security identity</h1><p className="subtitle">Manage the cryptographic identity used to approve STRATUM Verified lifecycle records and the credentials that protect your organization-scoped account.</p><div className="grid" style={{gap:16}}><SigningIdentityPanel/><PasswordPanel/></div></>}
