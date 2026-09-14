import {NextResponse} from 'next/server';
import {z} from 'zod';
import {requireSession} from '@/lib/server/auth';
import {accessibleProjectIds,requireProjectRole} from '@/lib/server/access';
import {appendAudit} from '@/lib/server/audit';
import {query,tx} from '@/lib/server/db';
import {telemetrySchemaReady} from '@/lib/server/telemetry';

const governanceRoles=['SUPER_ADMIN','ORG_ADMIN','PROJECT_MANAGER'] as const;
const Adapter=z.enum(['EPMS','BMS','DCIM','SCADA','PLC','OPC_UA','GENERIC']);
const Source=z.object({kind:z.literal('source'),projectId:z.string().uuid(),sourceCode:z.string().min(2).max(100).regex(/^[A-Za-z0-9_.:-]+$/),displayName:z.string().min(2).max(180),adapterType:Adapter,endpointRef:z.string().max(500).optional(),metadata:z.record(z.string(),z.unknown()).default({})});
const SourceStatus=z.object({kind:z.literal('source_status'),projectId:z.string().uuid(),sourceId:z.string().uuid(),status:z.enum(['ACTIVE','PAUSED','RETIRED'])});
const Binding=z.object({kind:z.literal('binding'),projectId:z.string().uuid(),sourceId:z.string().uuid(),externalPointKey:z.string().min(1).max(240),semanticKey:z.string().min(2).max(200).regex(/^[A-Za-z0-9_.:-]+$/),assetId:z.string().uuid(),touchpointId:z.string().uuid().optional(),dependencyIds:z.array(z.string().uuid()).max(100).default([]),valueType:z.enum(['NUMBER','BOOLEAN','STRING','JSON']).default('NUMBER'),engineeringUnit:z.string().max(80).optional(),multiplier:z.number().finite().default(1),offset:z.number().finite().default(0),expectedIntervalSeconds:z.number().int().positive().max(86400).optional(),staleAfterSeconds:z.number().int().positive().max(604800).optional(),mappingConfidence:z.number().min(0).max(1).default(1),mappingEvidence:z.array(z.record(z.string(),z.unknown())).max(50).default([]),sourceRef:z.record(z.string(),z.unknown()).default({})});
const BindingStatus=z.object({kind:z.literal('binding_status'),projectId:z.string().uuid(),bindingId:z.string().uuid(),status:z.enum(['REVIEW','APPROVED','RETIRED'])});
const Body=z.discriminatedUnion('kind',[Source,SourceStatus,Binding,BindingStatus]);

function endpointLooksSecret(value:string|undefined){
 if(!value)return false;
 if(/(?:password|passwd|secret|token|api[_-]?key)=/i.test(value))return true;
 try{const u=new URL(value);return Boolean(u.username||u.password);}catch{return false;}
}

export async function GET(req:Request){
 try{
  const session=await requireSession();
  if(!(await telemetrySchemaReady()))return NextResponse.json({schemaReady:false,error:'Telemetry database migration 009 has not been applied yet.'},{status:503});
  const ids=await accessibleProjectIds(session);const url=new URL(req.url);const requested=url.searchParams.get('projectId');
  const projectIds=requested?[requested]:ids;
  if(requested&&!ids.includes(requested))return NextResponse.json({error:'Project is not available to this session.'},{status:403});
  if(!projectIds.length)return NextResponse.json({schemaReady:true,sources:[],bindings:[]});
  const [sources,bindings]=await Promise.all([
   query<any>(`SELECT id::text,project_id::text,source_code,display_name,adapter_type,endpoint_ref,status,metadata,created_by::text,activated_by::text,activated_at,created_at,updated_at FROM telemetry_sources WHERE organization_id=$1 AND project_id=ANY($2::uuid[]) ORDER BY display_name`,[session.organizationId,projectIds]),
   query<any>(`SELECT b.id::text,b.project_id::text,b.source_id::text,s.source_code,b.external_point_key,b.semantic_key,b.asset_id::text,a.asset_code,a.name asset_name,b.touchpoint_id::text,t.touchpoint_code,b.value_type,b.engineering_unit,b.multiplier,b.offset_value,b.expected_interval_seconds,b.stale_after_seconds,b.mapping_confidence,b.mapping_evidence,b.source_ref,b.status,b.created_by::text,b.approved_by::text,b.approved_at,b.created_at,b.updated_at,ARRAY(SELECT d.dependency_id::text FROM telemetry_binding_dependencies d WHERE d.binding_id=b.id AND d.organization_id=b.organization_id AND d.project_id=b.project_id ORDER BY d.dependency_id)::text[] dependency_ids FROM telemetry_point_bindings b JOIN telemetry_sources s ON s.id=b.source_id AND s.organization_id=b.organization_id JOIN assets a ON a.id=b.asset_id AND a.organization_id=b.organization_id LEFT JOIN operational_touchpoints t ON t.id=b.touchpoint_id AND t.organization_id=b.organization_id WHERE b.organization_id=$1 AND b.project_id=ANY($2::uuid[]) ORDER BY s.source_code,b.semantic_key`,[session.organizationId,projectIds])
  ]);
  return NextResponse.json({schemaReady:true,authority:'OBSERVATIONAL_ONLY',truthBoundary:'LIVE_ITERATIONS_NEVER_OVERWRITE_VERIFIED',sources:sources.rows,bindings:bindings.rows});
 }catch(e:any){return NextResponse.json({error:e.message},{status:e.status||500})}
}

export async function POST(req:Request){
 try{
  const session=await requireSession();
  if(!(await telemetrySchemaReady()))return NextResponse.json({error:'Telemetry database migration 009 has not been applied yet.'},{status:503});
  const body=Body.parse(await req.json());
  const effectiveRole=await requireProjectRole(session,body.projectId,[...governanceRoles]);

  if(body.kind==='source'){
   if(endpointLooksSecret(body.endpointRef))return NextResponse.json({error:'endpointRef must be a non-secret endpoint or vault/reference identifier; embedded credentials are forbidden.'},{status:400});
   const r=await query<any>(`INSERT INTO telemetry_sources(organization_id,project_id,source_code,display_name,adapter_type,endpoint_ref,status,metadata,created_by) VALUES($1,$2,$3,$4,$5,$6,'DRAFT',$7::jsonb,$8) RETURNING id::text,project_id::text,source_code,display_name,adapter_type,endpoint_ref,status,metadata,created_at`,[session.organizationId,body.projectId,body.sourceCode,body.displayName,body.adapterType,body.endpointRef||null,JSON.stringify(body.metadata),session.userId]);
   await appendAudit({organizationId:session.organizationId,actorUserId:session.userId,action:'TELEMETRY_SOURCE_CREATE',entityType:'TELEMETRY_SOURCE',entityId:r.rows[0].id,metadata:{projectId:body.projectId,sourceCode:body.sourceCode,adapterType:body.adapterType,status:'DRAFT',effectiveRole}});
   return NextResponse.json({...r.rows[0],authority:'OBSERVATIONAL_ONLY'},{status:201});
  }

  if(body.kind==='source_status'){
   const existing=await query<any>(`SELECT id::text,status FROM telemetry_sources WHERE id=$1 AND organization_id=$2 AND project_id=$3 LIMIT 1`,[body.sourceId,session.organizationId,body.projectId]);
   if(!existing.rows[0])return NextResponse.json({error:'Telemetry source is not available in the selected project.'},{status:404});
   const current=String(existing.rows[0].status),next=body.status;
   const valid=(current==='DRAFT'&&next==='ACTIVE')||(current==='ACTIVE'&&['PAUSED','RETIRED'].includes(next))||(current==='PAUSED'&&['ACTIVE','RETIRED'].includes(next));
   if(!valid)return NextResponse.json({error:`Invalid telemetry source transition ${current} → ${next}.`},{status:409});
   const r=await query<any>(`UPDATE telemetry_sources SET status=$1,activated_by=CASE WHEN $1='ACTIVE' THEN $2 ELSE activated_by END,activated_at=CASE WHEN $1='ACTIVE' THEN now() ELSE activated_at END,updated_at=now() WHERE id=$3 AND organization_id=$4 AND project_id=$5 RETURNING id::text,source_code,display_name,adapter_type,status,activated_at`,[next,session.userId,body.sourceId,session.organizationId,body.projectId]);
   await appendAudit({organizationId:session.organizationId,actorUserId:session.userId,action:`TELEMETRY_SOURCE_${next}`,entityType:'TELEMETRY_SOURCE',entityId:body.sourceId,metadata:{projectId:body.projectId,previousStatus:current,newStatus:next,effectiveRole}});
   return NextResponse.json(r.rows[0]);
  }

  if(body.kind==='binding'){
   const dependencyIds=[...new Set(body.dependencyIds)];
   const created=await tx(async client=>{
    const source=await client.query<any>(`SELECT id::text,status FROM telemetry_sources WHERE id=$1 AND organization_id=$2 AND project_id=$3 FOR SHARE`,[body.sourceId,session.organizationId,body.projectId]);
    if(!source.rows[0])throw Object.assign(new Error('Telemetry source is not available in the selected project.'),{status:404});
    const asset=await client.query(`SELECT 1 FROM assets WHERE id=$1 AND organization_id=$2 AND project_id=$3 FOR SHARE`,[body.assetId,session.organizationId,body.projectId]);
    if(!asset.rowCount)throw Object.assign(new Error('Binding asset is not available in the selected project.'),{status:403});
    if(body.touchpointId){
     const t=await client.query<any>(`SELECT asset_id::text FROM operational_touchpoints WHERE id=$1 AND organization_id=$2 AND project_id=$3 FOR SHARE`,[body.touchpointId,session.organizationId,body.projectId]);
     if(!t.rows[0])throw Object.assign(new Error('Human Touchpoint is not available in the selected project.'),{status:403});
     if(t.rows[0].asset_id!==body.assetId)throw Object.assign(new Error('Human Touchpoint must belong to the same STRATUM Asset as the telemetry binding.'),{status:409});
    }
    if(dependencyIds.length){
     const edges=await client.query<any>(`SELECT id::text,source_asset_id::text,target_asset_id::text,relationship_type FROM operational_dependencies WHERE organization_id=$1 AND project_id=$2 AND id=ANY($3::uuid[]) FOR SHARE`,[session.organizationId,body.projectId,dependencyIds]);
     if(edges.rows.length!==dependencyIds.length)throw Object.assign(new Error('Every topology dependency must belong to the same organization and project as the telemetry binding.'),{status:403});
     const unrelated=edges.rows.find((edge:any)=>edge.source_asset_id!==body.assetId&&edge.target_asset_id!==body.assetId);
     if(unrelated)throw Object.assign(new Error(`Topology dependency ${unrelated.id} does not touch the mapped STRATUM Asset.`),{status:409});
    }
    const stale=body.staleAfterSeconds??(body.expectedIntervalSeconds?Math.max(body.expectedIntervalSeconds*3,body.expectedIntervalSeconds+30):null);
    const r=await client.query<any>(`INSERT INTO telemetry_point_bindings(organization_id,project_id,source_id,external_point_key,semantic_key,asset_id,touchpoint_id,value_type,engineering_unit,multiplier,offset_value,expected_interval_seconds,stale_after_seconds,mapping_confidence,mapping_evidence,source_ref,status,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16::jsonb,'DRAFT',$17) RETURNING id::text,source_id::text,external_point_key,semantic_key,asset_id::text,touchpoint_id::text,value_type,engineering_unit,expected_interval_seconds,stale_after_seconds,mapping_confidence,status`,[session.organizationId,body.projectId,body.sourceId,body.externalPointKey,body.semanticKey,body.assetId,body.touchpointId||null,body.valueType,body.engineeringUnit||null,body.multiplier,body.offset,body.expectedIntervalSeconds||null,stale,body.mappingConfidence,JSON.stringify(body.mappingEvidence),JSON.stringify(body.sourceRef),session.userId]);
    if(dependencyIds.length)await client.query(`INSERT INTO telemetry_binding_dependencies(binding_id,dependency_id,organization_id,project_id) SELECT $1,dependency_id,$2,$3 FROM unnest($4::uuid[]) dependency_id`,[r.rows[0].id,session.organizationId,body.projectId,dependencyIds]);
    return{...r.rows[0],dependency_ids:dependencyIds};
   });
   await appendAudit({organizationId:session.organizationId,actorUserId:session.userId,action:'TELEMETRY_BINDING_CREATE',entityType:'TELEMETRY_POINT_BINDING',entityId:created.id,metadata:{projectId:body.projectId,sourceId:body.sourceId,externalPointKey:body.externalPointKey,semanticKey:body.semanticKey,assetId:body.assetId,dependencyIds,status:'DRAFT',effectiveRole}});
   return NextResponse.json({...created,truthBoundary:'LIVE_ITERATIONS_NEVER_OVERWRITE_VERIFIED'},{status:201});
  }

  const binding=await query<any>(`SELECT id::text,status,created_by::text FROM telemetry_point_bindings WHERE id=$1 AND organization_id=$2 AND project_id=$3 LIMIT 1`,[body.bindingId,session.organizationId,body.projectId]);
  if(!binding.rows[0])return NextResponse.json({error:'Telemetry binding is not available in the selected project.'},{status:404});
  const current=String(binding.rows[0].status),next=body.status;
  const valid=(current==='DRAFT'&&next==='REVIEW')||(current==='REVIEW'&&next==='APPROVED')||(current==='APPROVED'&&next==='RETIRED');
  if(!valid)return NextResponse.json({error:`Invalid telemetry binding transition ${current} → ${next}. Required sequence is DRAFT → REVIEW → APPROVED → RETIRED.`},{status:409});
  if(next==='APPROVED'&&binding.rows[0].created_by===session.userId)return NextResponse.json({error:'Independent approval required: the binding author cannot approve the same semantic point binding.'},{status:409});
  const r=await query<any>(`UPDATE telemetry_point_bindings SET status=$1,approved_by=CASE WHEN $1='APPROVED' THEN $2 ELSE approved_by END,approved_at=CASE WHEN $1='APPROVED' THEN now() ELSE approved_at END,updated_at=now() WHERE id=$3 AND organization_id=$4 AND project_id=$5 RETURNING id::text,status,approved_by::text,approved_at`,[next,session.userId,body.bindingId,session.organizationId,body.projectId]);
  await appendAudit({organizationId:session.organizationId,actorUserId:session.userId,action:`TELEMETRY_BINDING_${next}`,entityType:'TELEMETRY_POINT_BINDING',entityId:body.bindingId,metadata:{projectId:body.projectId,previousStatus:current,newStatus:next,effectiveRole,independentApproval:next==='APPROVED'}});
  return NextResponse.json(r.rows[0]);
 }catch(e:any){
  if(e instanceof z.ZodError)return NextResponse.json({error:'Invalid telemetry configuration payload.',issues:e.issues},{status:400});
  return NextResponse.json({error:e.message},{status:e.status||400});
 }
}
