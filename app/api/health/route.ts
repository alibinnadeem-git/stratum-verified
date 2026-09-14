import {telemetrySchemaReady} from '@/lib/server/telemetry';

export async function GET(){
 const databaseConfigured=Boolean(process.env.DATABASE_URL);
 let telemetryConfigured=false;
 if(databaseConfigured){try{telemetryConfigured=await telemetrySchemaReady()}catch{telemetryConfigured=false}}
 return Response.json({
  ok:true,
  service:'stratum-verified',
  network:process.env.STRATUM_CHAIN_ID||'stratum-devnet-1',
  ledgerAdapter:process.env.STRATUM_CHAIN_RPC_URL?'stratum-rpc':'deterministic-devnet',
  databaseConfigured,
  authConfigured:Boolean(process.env.AUTH_SECRET),
  telemetrySchemaConfigured:telemetryConfigured,
  telemetryAuthority:'OBSERVATIONAL_ONLY',
  telemetryTruthBoundary:'LIVE_ITERATIONS_NEVER_OVERWRITE_VERIFIED'
 });
}
