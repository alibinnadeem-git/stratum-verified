import {NextResponse} from 'next/server';
import {z} from 'zod';
import {requireSession} from '@/lib/server/auth';
import {accessibleProjectIds,requireProjectRole} from '@/lib/server/access';
import {appendAudit} from '@/lib/server/audit';
import {query} from '@/lib/server/db';
import {impactAnalysis,operationalSchemaReady} from '@/lib/server/operational-intelligence';

const Touchpoint=z.object({kind:z.literal('touchpoint'),projectId:z.string().uuid(),assetId:z.string().uuid(),touchpointCode:z.string().min(2).max(100),name:z.string().min(2).max(180),touchpointType:z.string().min(2).max(80),currentState:z.string().max(100).optional(),permittedActions:z.array(z.string().max(80)).default([]),restrictedActions:z.array(z.string().max(80)).default([]),requiredRole:z.string().max(80).optional(),authorizationLevel:z.string().max(80).optional(),lotoRequired:z.boolean().default(false),hazards:z.array(z.string().max(160)).default([]),interlocks:z.array(z.string().max(160)).default([])});
const Procedure=z.object({kind:z.literal('procedure'),projectId:z.string().uuid(),procedureCode:z.string().min(2).max(100),procedureType:z.enum(['SOP','MOP','EOP','MAINTENANCE','LOTO','COMMISSIONING']),title:z.string().min(2).max(220),purpose:z.string().max(2000).optional(),version:z.string().min(1).max(30).default('1.0'),status:z.enum(['DRAFT','REVIEW']).default('DRAFT'),sourceRefs:z.array(z.record(z.string(),z.unknown())).default([])});
const ProcedureStatus=z.object({kind:z.literal('procedure_status'),projectId:z.string().uuid(),procedureId:z.string().uuid(),status:z.enum(['REVIEW','APPROVED','RETIRED'])});
const Step=z.object({kind:z.literal('step'),projectId:z.string().uuid(),procedureId:z.string().uuid(),sequenceNo:z.number().int().positive(),stepCode:z.string().min(1).max(80),title:z.string().min(2).max(180),instruction:z.string().min(2).max(5000),actorRole:z.string().max(80).optional(),assetId:z.string().uuid().optional(),touchpointId:z.string().uuid().optional(),prerequisites:z.record(z.string(),z.unknown()).default({}),expectedState:z.record(z.string(),z.unknown()).default({}),verification:z.record(z.string(),z.unknown()).default({}),failureBranchStepCode:z.string().max(80).optional(),isBlocking:z.boolean().default(true),sourceRef:z.record(z.string(),z.unknown()).default({})});
const Dependency=z.object({kind:z.literal('dependency'),projectId:z.string().uuid(),sourceAssetId:z.string().uuid(),targetAssetId:z.string().uuid(),relationshipType:z.enum(['FEEDS','COOLS','CONTROLS','DEPENDS_ON','PROTECTS','BYPASSES','REDUNDANT_TO','CONNECTED_TO']),criticality:z.enum(['LOW','NORMAL','HIGH','CRITICAL']).default('NORMAL'),sourceRef:z.record(z.string(),z.unknown()).default({})});
const Observation=z.object({kind:z.literal('observation'),projectId:z.string().uuid(),assetId:z.string().uuid(),touchpointId:z.string().uuid().optional(),sourceSystem:z.string().min(2).max(120),pointKey:z.string().min(1).max(160),value:z.unknown(),quality:z.enum(['GOOD','UNCERTAIN','BAD','STALE']).default('GOOD'),observedAt:z.string().datetime()});
const Body=z.discriminatedUnion('kind',[Touchpoint,Procedure,ProcedureStatus,Step,Dependency,Observation]);

async function assetInProject(organizationId:string,projectId:string,assetId:string){const r=await query(`SELECT id FROM assets WHERE id=$1 AND organization_id=$2 AND project_id=$3 LIMIT 1`,[assetId,organizationId,projectId]);return !!r.rows[0]}

export async function GET(req:Request){
 try{
  const session=await requireSession();const ids=await accessibleProjectIds(session);const url=new URL(req.url);
  if(url.searchParams.get('view')==='impact'){
   const assetId=url.searchParams.get('assetId');if(!assetId)return NextResponse.json({error:'assetId is required'},{status:400});
   const direction=url.searchParams.get('direction')==='UPSTREAM'?'UPSTREAM':'DOWNSTREAM';
   return NextResponse.json(await impactAnalysis(session.organizationId,ids,assetId,direction));
  }
  return NextResponse.json({schemaReady:await operationalSchemaReady()});
 }catch(e:any){return NextResponse.json({error:e.message},{status:e.status||500})}
}

export async function POST(req:Request){
 try{
  const session=await requireSession();if(!(await operationalSchemaReady()))return NextResponse.json({error:'Operational Intelligence database migration 007 has not been applied yet.'},{status:503});
  const body=Body.parse(await req.json());
  const effectiveRole=await requireProjectRole(session,body.projectId,['SUPER_ADMIN','ORG_ADMIN','PROJECT_MANAGER','TECHNICIAN','INSPECTOR']);
  const governanceRole=['SUPER_ADMIN','ORG_ADMIN','PROJECT_MANAGER'].includes(effectiveRole);
  if(body.kind==='touchpoint'){
   if(!(await assetInProject(session.organizationId,body.projectId,body.assetId)))return NextResponse.json({error:'Asset is not available in the selected project.'},{status:403});
   const r=await query<any>(`INSERT INTO operational_touchpoints(organization_id,project_id,asset_id,touchpoint_code,name,touchpoint_type,current_state,permitted_actions,restricted_actions,required_role,authorization_level,loto_required,hazards,interlocks,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,[session.organizationId,body.projectId,body.assetId,body.touchpointCode,body.name,body.touchpointType,body.currentState||null,JSON.stringify(body.permittedActions),JSON.stringify(body.restrictedActions),body.requiredRole||null,body.authorizationLevel||null,body.lotoRequired,JSON.stringify(body.hazards),JSON.stringify(body.interlocks),session.userId]);
   await appendAudit({organizationId:session.organizationId,actorUserId:session.userId,action:'OPERATIONAL_TOUCHPOINT_CREATE',entityType:'HUMAN_TOUCHPOINT',entityId:r.rows[0].id,metadata:{projectId:body.projectId,assetId:body.assetId,touchpointCode:body.touchpointCode,effectiveRole}});return NextResponse.json(r.rows[0],{status:201});
  }
  if(body.kind==='procedure'){
   const r=await query<any>(`INSERT INTO operational_procedures(organization_id,project_id,procedure_code,procedure_type,title,purpose,version,status,source_refs,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,[session.organizationId,body.projectId,body.procedureCode,body.procedureType,body.title,body.purpose||null,body.version,body.status,JSON.stringify(body.sourceRefs),session.userId]);
   await appendAudit({organizationId:session.organizationId,actorUserId:session.userId,action:'OPERATIONAL_PROCEDURE_CREATE',entityType:body.procedureType,entityId:r.rows[0].id,metadata:{projectId:body.projectId,procedureCode:body.procedureCode,version:body.version,status:body.status,effectiveRole}});return NextResponse.json(r.rows[0],{status:201});
  }
  if(body.kind==='procedure_status'){
   if(!governanceRole)return NextResponse.json({error:'Only project managers or organization administrators may approve or retire executable procedures.'},{status:403});
   const p=await query<any>(`SELECT id,status,(SELECT count(*)::int FROM operational_procedure_steps s WHERE s.procedure_id=operational_procedures.id AND s.organization_id=operational_procedures.organization_id) step_count FROM operational_procedures WHERE id=$1 AND organization_id=$2 AND project_id=$3 LIMIT 1`,[body.procedureId,session.organizationId,body.projectId]);if(!p.rows[0])return NextResponse.json({error:'Procedure is not available in the selected project.'},{status:404});
   if(body.status==='APPROVED'&&p.rows[0].step_count<1)return NextResponse.json({error:'A procedure must contain at least one machine-readable step before approval.'},{status:409});
   if(p.rows[0].status==='RETIRED')return NextResponse.json({error:'A retired procedure is immutable. Create a new version instead.'},{status:409});
   const r=await query<any>(`UPDATE operational_procedures SET status=$1,approved_by=CASE WHEN $1='APPROVED' THEN $2 ELSE approved_by END,approved_at=CASE WHEN $1='APPROVED' THEN now() ELSE approved_at END,updated_at=now() WHERE id=$3 AND organization_id=$4 AND project_id=$5 RETURNING *`,[body.status,session.userId,body.procedureId,session.organizationId,body.projectId]);
   await appendAudit({organizationId:session.organizationId,actorUserId:session.userId,action:`OPERATIONAL_PROCEDURE_${body.status}`,entityType:'PROCEDURE',entityId:body.procedureId,metadata:{projectId:body.projectId,previousStatus:p.rows[0].status,newStatus:body.status,effectiveRole}});return NextResponse.json(r.rows[0]);
  }
  if(body.kind==='step'){
   const p=await query<any>(`SELECT id,status FROM operational_procedures WHERE id=$1 AND organization_id=$2 AND project_id=$3 LIMIT 1`,[body.procedureId,session.organizationId,body.projectId]);if(!p.rows[0])return NextResponse.json({error:'Procedure is not available in the selected project.'},{status:403});
   if(['APPROVED','RETIRED'].includes(p.rows[0].status))return NextResponse.json({error:'Approved or retired procedures are immutable. Create a new procedure version to change steps.'},{status:409});
   if(body.assetId&&!(await assetInProject(session.organizationId,body.projectId,body.assetId)))return NextResponse.json({error:'Step asset is not available in the selected project.'},{status:403});
   if(body.touchpointId){const t=await query(`SELECT id FROM operational_touchpoints WHERE id=$1 AND organization_id=$2 AND project_id=$3 LIMIT 1`,[body.touchpointId,session.organizationId,body.projectId]);if(!t.rows[0])return NextResponse.json({error:'Human Touchpoint is not available in the selected project.'},{status:403})}
   const r=await query<any>(`INSERT INTO operational_procedure_steps(organization_id,procedure_id,sequence_no,step_code,title,instruction,actor_role,asset_id,touchpoint_id,prerequisites,expected_state,verification,failure_branch_step_code,is_blocking,source_ref) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,[session.organizationId,body.procedureId,body.sequenceNo,body.stepCode,body.title,body.instruction,body.actorRole||null,body.assetId||null,body.touchpointId||null,JSON.stringify(body.prerequisites),JSON.stringify(body.expectedState),JSON.stringify(body.verification),body.failureBranchStepCode||null,body.isBlocking,JSON.stringify(body.sourceRef)]);
   await appendAudit({organizationId:session.organizationId,actorUserId:session.userId,action:'OPERATIONAL_PROCEDURE_STEP_CREATE',entityType:'PROCEDURE_STEP',entityId:r.rows[0].id,metadata:{projectId:body.projectId,procedureId:body.procedureId,stepCode:body.stepCode,sequenceNo:body.sequenceNo,effectiveRole}});return NextResponse.json(r.rows[0],{status:201});
  }
  if(body.kind==='dependency'){
   if(body.sourceAssetId===body.targetAssetId)return NextResponse.json({error:'An asset cannot depend on itself.'},{status:400});
   if(!(await assetInProject(session.organizationId,body.projectId,body.sourceAssetId))||!(await assetInProject(session.organizationId,body.projectId,body.targetAssetId)))return NextResponse.json({error:'Both assets must belong to the selected project.'},{status:403});
   const r=await query<any>(`INSERT INTO operational_dependencies(organization_id,project_id,source_asset_id,target_asset_id,relationship_type,criticality,source_ref,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(organization_id,source_asset_id,target_asset_id,relationship_type) DO UPDATE SET criticality=EXCLUDED.criticality,source_ref=EXCLUDED.source_ref RETURNING *`,[session.organizationId,body.projectId,body.sourceAssetId,body.targetAssetId,body.relationshipType,body.criticality,JSON.stringify(body.sourceRef),session.userId]);
   await appendAudit({organizationId:session.organizationId,actorUserId:session.userId,action:'OPERATIONAL_DEPENDENCY_UPSERT',entityType:'ASSET_RELATIONSHIP',entityId:r.rows[0].id,metadata:{projectId:body.projectId,sourceAssetId:body.sourceAssetId,targetAssetId:body.targetAssetId,relationshipType:body.relationshipType,effectiveRole}});return NextResponse.json(r.rows[0],{status:201});
  }
  if(!(await assetInProject(session.organizationId,body.projectId,body.assetId)))return NextResponse.json({error:'Observation asset is not available in the selected project.'},{status:403});
  const r=await query<any>(`INSERT INTO operational_observations(organization_id,project_id,asset_id,touchpoint_id,source_system,point_key,value_json,quality,observed_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,[session.organizationId,body.projectId,body.assetId,body.touchpointId||null,body.sourceSystem,body.pointKey,JSON.stringify(body.value),body.quality,new Date(body.observedAt)]);
  return NextResponse.json(r.rows[0],{status:201});
 }catch(e:any){return NextResponse.json({error:e.message},{status:e.status||400})}
}
