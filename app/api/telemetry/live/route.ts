import {NextResponse} from 'next/server';
import {requireSession} from '@/lib/server/auth';
import {accessibleProjectIds} from '@/lib/server/access';
import {query} from '@/lib/server/db';
import {telemetrySchemaReady} from '@/lib/server/telemetry';

export async function GET(req:Request){
 try{
  const session=await requireSession();
  if(!(await telemetrySchemaReady()))return NextResponse.json({schemaReady:false,error:'Telemetry database migration 009 has not been applied yet.',authority:'OBSERVATIONAL_ONLY',truthBoundary:'LIVE_ITERATIONS_NEVER_OVERWRITE_VERIFIED'},{status:503});
  const accessible=await accessibleProjectIds(session);const url=new URL(req.url);
  const requestedProject=url.searchParams.get('projectId');
  const assetId=url.searchParams.get('assetId');
  const semanticKey=url.searchParams.get('semanticKey');
  const limit=Math.max(1,Math.min(500,Number(url.searchParams.get('limit')||100)||100));
  const projectIds=requestedProject?[requestedProject]:accessible;
  if(requestedProject&&!accessible.includes(requestedProject))return NextResponse.json({error:'Project is not available to this session.'},{status:403});
  if(!projectIds.length)return NextResponse.json({schemaReady:true,authority:'OBSERVATIONAL_ONLY',truthBoundary:'LIVE_ITERATIONS_NEVER_OVERWRITE_VERIFIED',iterations:[]});

  const values:any[]=[session.organizationId,projectIds];const where:string[]=[];
  if(assetId){values.push(assetId);where.push(`li.asset_id=$${values.length}::uuid`)}
  if(semanticKey){values.push(semanticKey);where.push(`li.semantic_key=$${values.length}`)}
  values.push(limit);const limitParam=values.length;
  const r=await query<any>(`SELECT li.id::text,li.project_id::text,li.asset_id::text,a.asset_code,a.name asset_name,li.touchpoint_id::text,t.touchpoint_code,t.name touchpoint_name,li.observation_id::text,li.telemetry_binding_id::text,li.semantic_key,li.normalized_value_json,li.engineering_unit,li.quality,li.confidence,li.observed_at,li.received_at,li.authority,li.control_authority,li.verified_baseline_mutation,li.mapping_evidence,li.source_ref,li.metadata FROM operational_live_iterations li JOIN assets a ON a.id=li.asset_id AND a.organization_id=li.organization_id LEFT JOIN operational_touchpoints t ON t.id=li.touchpoint_id AND t.organization_id=li.organization_id WHERE li.organization_id=$1 AND li.project_id=ANY($2::uuid[])${where.length?' AND '+where.join(' AND '):''} ORDER BY li.observed_at DESC,li.id DESC LIMIT $${limitParam}`,[...values]);
  return NextResponse.json({schemaReady:true,authority:'OBSERVATIONAL_ONLY',truthBoundary:'LIVE_ITERATIONS_NEVER_OVERWRITE_VERIFIED',count:r.rows.length,iterations:r.rows});
 }catch(e:any){return NextResponse.json({error:e.message},{status:e.status||500})}
}
