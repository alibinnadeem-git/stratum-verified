import {NextResponse} from 'next/server';

export const dynamic='force-dynamic';

export async function GET(){
  const expectedRp='stratum-verified.vercel.app';
  const expectedOrigin='https://stratum-verified.vercel.app';
  const checks={
    database:!!process.env.DATABASE_URL,
    authSecret:!!process.env.AUTH_SECRET,
    dirsRpc:!!process.env.STRATUM_CHAIN_RPC_URL,
    dirsNetwork:!!process.env.STRATUM_CHAIN_ID,
    webauthnRpId:process.env.WEBAUTHN_RP_ID===expectedRp,
    webauthnOrigin:process.env.WEBAUTHN_ORIGIN===expectedOrigin,
    webauthnRpName:!!process.env.WEBAUTHN_RP_NAME,
    cronSecret:!!process.env.CRON_SECRET,
  };
  const ready=Object.values(checks).every(Boolean);
  return NextResponse.json({service:'STRATUM Verified',layer:'Digital Immutable Records (DIRs)',ready,checks},{status:ready?200:503,headers:{'cache-control':'no-store'}});
}
