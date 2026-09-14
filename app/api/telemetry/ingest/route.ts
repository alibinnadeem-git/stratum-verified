import {NextResponse} from 'next/server';
import {z} from 'zod';
import {requireSession} from '@/lib/server/auth';
import {requireProjectRole} from '@/lib/server/access';
import {appendAudit} from '@/lib/server/audit';
import {query} from '@/lib/server/db';
import {ingestTelemetryBatch} from '@/lib/server/telemetry';

const Sample=z.object({
  externalPointKey:z.string().min(1).max(240),
  value:z.unknown(),
  quality:z.union([z.string().max(100),z.number().int()]).optional(),
  observedAt:z.string().datetime(),
  idempotencyKey:z.string().min(8).max(200).regex(/^[A-Za-z0-9_.:-]+$/).optional()
});
const Body=z.object({sourceCode:z.string().min(2).max(100),samples:z.array(Sample).min(1).max(500)});
const MAX_BODY_BYTES=1_000_000;

export async function POST(req:Request){
 try{
  const session=await requireSession();
  const length=Number(req.headers.get('content-length')||0);
  if(length>MAX_BODY_BYTES)return NextResponse.json({error:'Telemetry batch exceeds the 1 MB ingestion limit.'},{status:413});
  const raw=await req.text();
  if(Buffer.byteLength(raw,'utf8')>MAX_BODY_BYTES)return NextResponse.json({error:'Telemetry batch exceeds the 1 MB ingestion limit.'},{status:413});
  let json:unknown;try{json=JSON.parse(raw)}catch{return NextResponse.json({error:'Telemetry request body must be valid JSON.'},{status:400})}
  const body=Body.parse(json);
  const source=await query<{id:string;project_id:string;status:string}>(`SELECT id::text,project_id::text,status FROM telemetry_sources WHERE organization_id=$1 AND source_code=$2 LIMIT 1`,[session.organizationId,body.sourceCode]);
  const row=source.rows[0];
  if(!row)return NextResponse.json({error:'Telemetry source not found in this organization.'},{status:404});
  await requireProjectRole(session,row.project_id,['SUPER_ADMIN','ORG_ADMIN','PROJECT_MANAGER']);
  const result=await ingestTelemetryBatch({organizationId:session.organizationId,sourceCode:body.sourceCode,samples:body.samples});
  await appendAudit({organizationId:session.organizationId,actorUserId:session.userId,action:'TELEMETRY_BATCH_INGEST',entityType:'STRATUM_LIVE_ITERATION',entityId:row.id,metadata:{projectId:row.project_id,sourceCode:body.sourceCode,accepted:result.summary.accepted,duplicates:result.summary.duplicates,rejected:result.summary.rejected,authority:result.authority,truthBoundary:result.truthBoundary}});
  return NextResponse.json(result,{status:result.summary.accepted||result.summary.duplicates?200:422});
 }catch(e:any){
  if(e instanceof z.ZodError)return NextResponse.json({error:'Invalid telemetry payload.',issues:e.issues},{status:400});
  return NextResponse.json({error:e.message},{status:e.status||500});
 }
}
