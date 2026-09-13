import {NextResponse} from 'next/server';
import {z} from 'zod';
import {requireSession} from '@/lib/server/auth';
import {accessibleProjectIds,requireProjectRole} from '@/lib/server/access';
import {appendAudit} from '@/lib/server/audit';
import {query} from '@/lib/server/db';
import {abortProcedureRun,procedureExecutionSchemaReady,procedureRunDetail,procedureRuns,resumeProcedureRun,simulateProcedure,startProcedureRun,verifyCurrentStep} from '@/lib/server/procedure-execution';

const Start=z.object({action:z.literal('START'),procedureId:z.string().uuid()});
const Verify=z.object({action:z.literal('VERIFY_STEP'),runId:z.string().uuid(),manualConfirmed:z.boolean().default(false),note:z.string().max(2000).optional()});
const Resume=z.object({action:z.literal('RESUME'),runId:z.string().uuid()});
const Abort=z.object({action:z.literal('ABORT'),runId:z.string().uuid(),reason:z.string().max(2000).optional()});
const Body=z.discriminatedUnion('action',[Start,Verify,Resume,Abort]);

async function procedureProject(organizationId:string,procedureId:string){const r=await query<{project_id:string}>(`SELECT project_id::text FROM operational_procedures WHERE id=$1 AND organization_id=$2 LIMIT 1`,[procedureId,organizationId]);return r.rows[0]?.project_id||null}
async function runProject(organizationId:string,runId:string){const r=await query<{project_id:string}>(`SELECT project_id::text FROM operational_procedure_runs WHERE id=$1 AND organization_id=$2 LIMIT 1`,[runId,organizationId]);return r.rows[0]?.project_id||null}

export async function GET(req:Request){
 try{
  const session=await requireSession();const projectIds=await accessibleProjectIds(session);const url=new URL(req.url);const view=url.searchParams.get('view');
  if(!(await procedureExecutionSchemaReady()))return NextResponse.json({schemaReady:false,runs:[]});
  if(view==='simulation'){
   const procedureId=url.searchParams.get('procedureId');if(!procedureId)return NextResponse.json({error:'procedureId is required'},{status:400});
   return NextResponse.json(await simulateProcedure(session.organizationId,projectIds,procedureId));
  }
  if(view==='run'){
   const runId=url.searchParams.get('runId');if(!runId)return NextResponse.json({error:'runId is required'},{status:400});
   const detail=await procedureRunDetail(session.organizationId,projectIds,runId);if(!detail)return NextResponse.json({error:'Procedure run not found.'},{status:404});return NextResponse.json(detail);
  }
  return NextResponse.json({schemaReady:true,runs:await procedureRuns(session.organizationId,projectIds)});
 }catch(e:any){return NextResponse.json({error:e.message},{status:e.status||500})}
}

export async function POST(req:Request){
 try{
  const session=await requireSession();if(!(await procedureExecutionSchemaReady()))return NextResponse.json({error:'Procedure Execution database migration 008 has not been applied yet.'},{status:503});const body=Body.parse(await req.json());const projectIds=await accessibleProjectIds(session);
  if(body.action==='START'){
   const projectId=await procedureProject(session.organizationId,body.procedureId);if(!projectId)return NextResponse.json({error:'Procedure not found.'},{status:404});
   const effectiveRole=await requireProjectRole(session,projectId,['SUPER_ADMIN','ORG_ADMIN','PROJECT_MANAGER','TECHNICIAN','INSPECTOR']);
   const run=await startProcedureRun({organizationId:session.organizationId,projectId,procedureId:body.procedureId,userId:session.userId});
   await appendAudit({organizationId:session.organizationId,actorUserId:session.userId,action:'PROCEDURE_RUN_START',entityType:'PROCEDURE_RUN',entityId:String(run.id),metadata:{projectId,procedureId:body.procedureId,effectiveRole,status:run.status}});return NextResponse.json(run,{status:201});
  }
  const projectId=await runProject(session.organizationId,body.runId);if(!projectId||!projectIds.includes(projectId))return NextResponse.json({error:'Procedure run not found or not accessible.'},{status:404});
  const effectiveRole=await requireProjectRole(session,projectId,['SUPER_ADMIN','ORG_ADMIN','PROJECT_MANAGER','TECHNICIAN','INSPECTOR']);
  if(body.action==='VERIFY_STEP'){
   const result=await verifyCurrentStep({organizationId:session.organizationId,projectIds,runId:body.runId,userId:session.userId,manualConfirmed:body.manualConfirmed,note:body.note});
   await appendAudit({organizationId:session.organizationId,actorUserId:session.userId,action:'PROCEDURE_STEP_VERIFY',entityType:'PROCEDURE_RUN',entityId:body.runId,metadata:{projectId,effectiveRole,resultStatus:result.status,verifiedStep:(result as any).verifiedStep||null,failedStep:(result as any).failedStep||null}});return NextResponse.json(result);
  }
  if(body.action==='RESUME'){
   const result=await resumeProcedureRun({organizationId:session.organizationId,projectIds,runId:body.runId,userId:session.userId});
   await appendAudit({organizationId:session.organizationId,actorUserId:session.userId,action:'PROCEDURE_RUN_RESUME',entityType:'PROCEDURE_RUN',entityId:body.runId,metadata:{projectId,effectiveRole,currentStep:result.currentStep}});return NextResponse.json(result);
  }
  const result=await abortProcedureRun({organizationId:session.organizationId,projectIds,runId:body.runId,userId:session.userId,reason:body.reason});
  await appendAudit({organizationId:session.organizationId,actorUserId:session.userId,action:'PROCEDURE_RUN_ABORT',entityType:'PROCEDURE_RUN',entityId:body.runId,metadata:{projectId,effectiveRole,reason:body.reason||null}});return NextResponse.json(result);
 }catch(e:any){return NextResponse.json({error:e.message},{status:e.status||400})}
}
