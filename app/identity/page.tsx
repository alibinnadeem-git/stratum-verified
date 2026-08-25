import SigningIdentityPanel from '@/components/SigningIdentityPanel';
export default function IdentityPage(){return <><div className="eyebrow">Personal Security</div><h1 className="title">My signing identity</h1><p className="subtitle">Manage the cryptographic identity used to approve STRATUM Verified lifecycle records before they are anchored to STRATUM Chain.</p><SigningIdentityPanel/></>}
