import SigningIdentityPanel from '@/components/SigningIdentityPanel';
import PasskeyPanel from '@/components/PasskeyPanel';
import PasswordPanel from '@/components/PasswordPanel';
import {requirePageSession} from '@/lib/server/page-auth';
export const dynamic='force-dynamic';
export default async function IdentityPage(){await requirePageSession('/identity');return <><div className="eyebrow">Personal Security</div><h1 className="title">My security identity</h1><p className="subtitle">Manage hardware-backed passkeys, cryptographic approval identities and credentials that protect your organization-scoped STRATUM Verified account.</p><div className="grid" style={{gap:16}}><PasskeyPanel/><SigningIdentityPanel/><PasswordPanel/></div></>}
