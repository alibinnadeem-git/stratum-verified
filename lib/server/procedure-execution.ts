import type {PoolClient} from 'pg';
import {query,tx} from './db';
import {evaluateObservationRule,type RuleResult} from '../procedure-rule-contract';

export type {RuleResult} from '../procedure-rule-contract';
export const evaluateRule=evaluateObservationRule;

export async function procedureExecutionSchemaReady(){
  const r=await query<{ready:boolean}>(`SELECT to_regclass('public.operational_procedure_runs') IS NOT NULL AND to_regclass('public.operational_step_runs') IS NOT NULL AS ready`);
  return !!r.rows[0]?.ready;
}

async function latestObservation(organizationId:string,projectId:string,assetId:string|null,rule:any,client?:PoolClient){
  const pointKey=rule&&typeof rule==='object'&&typeof rule.pointKey==='string'?rule.pointKey:null;
  if(!assetId||!pointKey)return null;
  const sql=`SELECT value_json,quality,observed_at,source_system,point_key FROM operational_observations WHERE organization_id=$1 AND project_id=$2 AND asset_id=$3 AND point_key=$4 ORDER BY observed_at DESC LIMIT 1`;
  const r=client?await client.query<any>(sql,[organizationId,projectId,assetId,pointKey]):await query<any>(sql,[organizationId,projectId,assetId,pointKey]);
  return r.rows[0]||null;
}

async function evaluatePrerequisites(organizationId:string,projectId:string,step:any,client?:PoolClient){
  const p=step.prerequisites||{};
  const rules=Array.isArray(p.conditions)?p.conditions:(p.pointKey?[p]:[]);
  if(!rules.length)return{pass:true,results:[{status:'MANUAL',machineEvaluated:false,reason:'No machine prerequisites defined.'} as RuleResult]};
  const results:RuleResult[]=[];
  for(const rule of rules){const obs=await latestObservation(organizationId,projectId,step.asset_id||null,rule,client);results.push(evaluateRule(rule,obs))}
  return{pass:results.every(x=>x.status==='PASS'||x.status==='MANUAL'),results};
}

async function evaluateExpected(organizationId:string,projectId:string,step:any,client?:PoolClient){
  const rule=step.expected_state||{};const obs=await latestObservation(organizationId,projectId,step.asset_id||null,rule,client);return evaluateRule(rule,obs);
}

async function recordPrerequisiteException(c:PoolClient,input:{organizationId:string;projectId:string;procedureId:string;step:any;runId:string;stepRunId:string;results:RuleResult[]}){
  const severity=input.step.is_blocking?'BLOCK':'WARNING';
  await c.query(`INSERT INTO operational_exceptions(organization_id,project_id,asset_id,procedure_id,procedure_step_id,procedure_run_id,step_run_id,exception_type,severity,expected_state,actual_state,status,details) VALUES($1,$2,$3,$4,$5,$6,$7,'PREREQUISITE_NOT_SATISFIED',$8,$9::jsonb,'{}'::jsonb,'OPEN',$10::jsonb)`,[input.organizationId,input.projectId,input.step.asset_id||null,input.procedureId,input.step.id,input.runId,input.stepRunId,severity,JSON.stringify(input.step.prerequisites||{}),JSON.stringify({results:input.results})]);
}

async function advanceAfterStep(c:PoolClient,input:{organizationId:string;run:any;step:any;userId:string}){
  const next=await c.query<any>(`SELECT * FROM operational_procedure_steps WHERE organization_id=$1 AND procedure_id=$2 AND sequence_no>$3 ORDER BY sequence_no LIMIT 1`,[input.organizationId,input.run.procedure_id,input.step.sequence_no]);
  if(!next.rows[0]){
    await c.query(`UPDATE operational_procedure_runs SET status='COMPLETED',current_step_id=NULL,completed_at=now(),updated_at=now() WHERE id=$1`,[input.run.id]);
    return{status:'COMPLETED' as const,nextStep:null,prerequisites:[] as RuleResult[]};
  }
  const n=next.rows[0];const prereq=await evaluatePrerequisites(input.organizationId,input.run.project_id,n,c);const blocked=!prereq.pass&&n.is_blocking;
  const nsr=await c.query<any>(`INSERT INTO operational_step_runs(organization_id,project_id,procedure_run_id,procedure_step_id,status,expected_state,verification_result,started_by,started_at) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,now()) ON CONFLICT(procedure_run_id,procedure_step_id) DO UPDATE SET status=EXCLUDED.status,verification_result=EXCLUDED.verification_result,updated_at=now() RETURNING *`,[input.organizationId,input.run.project_id,input.run.id,n.id,blocked?'BLOCKED':'READY',JSON.stringify(n.expected_state||{}),JSON.stringify({prerequisites:prereq.results}),input.userId]);
  await c.query(`UPDATE operational_procedure_runs SET status=$1,current_step_id=$2,updated_at=now() WHERE id=$3`,[blocked?'BLOCKED':'RUNNING',n.id,input.run.id]);
  if(!prereq.pass)await recordPrerequisiteException(c,{organizationId:input.organizationId,projectId:input.run.project_id,procedureId:input.run.procedure_id,step:n,runId:input.run.id,stepRunId:nsr.rows[0].id,results:prereq.results});
  return{status:(blocked?'BLOCKED':'RUNNING') as 'BLOCKED'|'RUNNING',nextStep:n.step_code,prerequisites:prereq.results};
}

export async function procedureSteps(organizationId:string,projectIds:string[],procedureId?:string){
  if(!projectIds.length)return[];
  const values:any[]=[organizationId,projectIds];let extra='';
  if(procedureId){values.push(procedureId);extra=' AND s.procedure_id=$3'}
  const r=await query<any>(`SELECT s.id::text,s.procedure_id::text,s.sequence_no,s.step_code,s.title,s.instruction,s.actor_role,s.asset_id::text,s.touchpoint_id::text,s.prerequisites,s.expected_state,s.verification,s.failure_branch_step_code,s.is_blocking,s.source_ref,p.project_id::text,p.procedure_code,p.procedure_type,p.title procedure_title,p.status procedure_status,a.asset_code,a.name asset_name,t.touchpoint_code,t.name touchpoint_name FROM operational_procedure_steps s JOIN operational_procedures p ON p.id=s.procedure_id AND p.organization_id=s.organization_id LEFT JOIN assets a ON a.id=s.asset_id AND a.organization_id=s.organization_id LEFT JOIN operational_touchpoints t ON t.id=s.touchpoint_id AND t.organization_id=s.organization_id WHERE s.organization_id=$1 AND p.project_id=ANY($2::uuid[])${extra} ORDER BY p.procedure_code,s.sequence_no`,values);
  return r.rows;
}

export async function procedureRuns(organizationId:string,projectIds:string[]){
  if(!projectIds.length||!(await procedureExecutionSchemaReady()))return[];
  const r=await query<any>(`SELECT r.id::text,r.project_id::text,r.procedure_id::text,r.execution_mode,r.status,r.current_step_id::text,r.started_at,r.completed_at,r.aborted_at,r.created_at,p.procedure_code,p.procedure_type,p.title procedure_title,p.version,s.sequence_no current_sequence,s.step_code current_step_code,s.title current_step_title,s.instruction current_instruction,s.expected_state current_expected_state,s.prerequisites current_prerequisites,s.is_blocking current_is_blocking,s.failure_branch_step_code current_failure_branch,(SELECT count(*)::int FROM operational_step_runs sr WHERE sr.procedure_run_id=r.id AND sr.status='VERIFIED') verified_steps,(SELECT count(*)::int FROM operational_procedure_steps ps WHERE ps.procedure_id=r.procedure_id) total_steps FROM operational_procedure_runs r JOIN operational_procedures p ON p.id=r.procedure_id AND p.organization_id=r.organization_id LEFT JOIN operational_procedure_steps s ON s.id=r.current_step_id AND s.organization_id=r.organization_id WHERE r.organization_id=$1 AND r.project_id=ANY($2::uuid[]) ORDER BY r.created_at DESC LIMIT 100`,[organizationId,projectIds]);
  return r.rows;
}

export async function procedureRunDetail(organizationId:string,projectIds:string[],runId:string){
  if(!projectIds.length||!(await procedureExecutionSchemaReady()))return null;
  const r=await query<any>(`SELECT r.id::text,r.project_id::text,r.procedure_id::text,r.execution_mode,r.status,r.current_step_id::text,r.started_at,r.completed_at,r.aborted_at,r.context,r.created_at,p.procedure_code,p.procedure_type,p.title procedure_title,p.version FROM operational_procedure_runs r JOIN operational_procedures p ON p.id=r.procedure_id AND p.organization_id=r.organization_id WHERE r.id=$1 AND r.organization_id=$2 AND r.project_id=ANY($3::uuid[]) LIMIT 1`,[runId,organizationId,projectIds]);
  if(!r.rows[0])return null;
  const steps=await query<any>(`SELECT ps.id::text procedure_step_id,ps.sequence_no,ps.step_code,ps.title,ps.instruction,ps.actor_role,ps.asset_id::text,ps.touchpoint_id::text,ps.prerequisites,ps.expected_state,ps.verification,ps.failure_branch_step_code,ps.is_blocking,a.asset_code,a.name asset_name,t.touchpoint_code,t.name touchpoint_name,sr.id::text step_run_id,sr.status step_run_status,sr.observed_state,sr.verification_result,sr.operator_note,sr.started_at step_started_at,sr.completed_at step_completed_at FROM operational_procedure_steps ps LEFT JOIN assets a ON a.id=ps.asset_id LEFT JOIN operational_touchpoints t ON t.id=ps.touchpoint_id LEFT JOIN operational_step_runs sr ON sr.procedure_run_id=$1 AND sr.procedure_step_id=ps.id AND sr.organization_id=$2 WHERE ps.procedure_id=$3 AND ps.organization_id=$2 ORDER BY ps.sequence_no`,[runId,organizationId,r.rows[0].procedure_id]);
  return{...r.rows[0],steps:steps.rows};
}

export async function simulateProcedure(organizationId:string,projectIds:string[],procedureId:string){
  if(!projectIds.length)return{procedure:null,summary:{pass:0,warning:0,block:0},steps:[]};
  const p=await query<any>(`SELECT id::text,project_id::text,procedure_code,procedure_type,title,version,status FROM operational_procedures WHERE id=$1 AND organization_id=$2 AND project_id=ANY($3::uuid[]) LIMIT 1`,[procedureId,organizationId,projectIds]);
  if(!p.rows[0])return{procedure:null,summary:{pass:0,warning:0,block:0},steps:[]};
  const steps=await procedureSteps(organizationId,projectIds,procedureId);const out:any[]=[];
  for(const step of steps){
    const prereq=await evaluatePrerequisites(organizationId,p.rows[0].project_id,step);
    const expected=step.expected_state&&Object.keys(step.expected_state).length?await evaluateExpected(organizationId,p.rows[0].project_id,step):{status:'MANUAL',machineEvaluated:false,reason:'No machine-verifiable expected state.'};
    let readiness:'PASS'|'WARNING'|'BLOCK'='PASS';
    const expectedFailed=expected.status==='FAIL';
    if((!prereq.pass||expectedFailed)&&step.is_blocking)readiness='BLOCK';
    else if(!prereq.pass||expectedFailed||expected.status==='NO_DATA'||expected.status==='MANUAL')readiness='WARNING';
    out.push({...step,readiness,prerequisiteResults:prereq.results,currentExpectedPointCheck:expected});
  }
  return{procedure:p.rows[0],summary:{pass:out.filter(x=>x.readiness==='PASS').length,warning:out.filter(x=>x.readiness==='WARNING').length,block:out.filter(x=>x.readiness==='BLOCK').length},steps:out};
}

export async function startProcedureRun(input:{organizationId:string;projectId:string;procedureId:string;userId:string}){
  return tx(async c=>{
    const p=await c.query<any>(`SELECT id,project_id,status FROM operational_procedures WHERE id=$1 AND organization_id=$2 AND project_id=$3 FOR SHARE`,[input.procedureId,input.organizationId,input.projectId]);
    if(!p.rows[0])throw Object.assign(new Error('Procedure not found in this project.'),{status:404});
    if(p.rows[0].status!=='APPROVED')throw Object.assign(new Error('Only APPROVED procedures can enter live execution.'),{status:409});
    const first=await c.query<any>(`SELECT * FROM operational_procedure_steps WHERE organization_id=$1 AND procedure_id=$2 ORDER BY sequence_no LIMIT 1`,[input.organizationId,input.procedureId]);
    if(!first.rows[0])throw Object.assign(new Error('Procedure has no executable steps.'),{status:409});
    const step=first.rows[0];const prereq=await evaluatePrerequisites(input.organizationId,input.projectId,step,c);const blocked=!prereq.pass&&step.is_blocking;
    const run=await c.query<any>(`INSERT INTO operational_procedure_runs(organization_id,project_id,procedure_id,execution_mode,status,current_step_id,initiated_by,started_at,context) VALUES($1,$2,$3,'LIVE',$4,$5,$6,now(),$7::jsonb) RETURNING *`,[input.organizationId,input.projectId,input.procedureId,blocked?'BLOCKED':'RUNNING',step.id,input.userId,JSON.stringify({initialPrerequisiteEvaluation:prereq.results})]);
    const sr=await c.query<any>(`INSERT INTO operational_step_runs(organization_id,project_id,procedure_run_id,procedure_step_id,status,expected_state,verification_result,started_by,started_at) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,now()) RETURNING *`,[input.organizationId,input.projectId,run.rows[0].id,step.id,blocked?'BLOCKED':'READY',JSON.stringify(step.expected_state||{}),JSON.stringify({prerequisites:prereq.results}),input.userId]);
    if(!prereq.pass)await recordPrerequisiteException(c,{organizationId:input.organizationId,projectId:input.projectId,procedureId:input.procedureId,step,runId:run.rows[0].id,stepRunId:sr.rows[0].id,results:prereq.results});
    return run.rows[0];
  });
}

export async function verifyCurrentStep(input:{organizationId:string;projectIds:string[];runId:string;userId:string;manualConfirmed:boolean;note?:string}){
  return tx(async c=>{
    const rr=await c.query<any>(`SELECT r.*,p.procedure_code FROM operational_procedure_runs r JOIN operational_procedures p ON p.id=r.procedure_id WHERE r.id=$1 AND r.organization_id=$2 AND r.project_id=ANY($3::uuid[]) FOR UPDATE`,[input.runId,input.organizationId,input.projectIds]);
    const run=rr.rows[0];if(!run)throw Object.assign(new Error('Procedure run not found.'),{status:404});
    if(run.status!=='RUNNING')throw Object.assign(new Error(`Procedure run is ${run.status}; it must be RUNNING to verify a step.`),{status:409});
    if(!run.current_step_id)throw Object.assign(new Error('Procedure run has no current step.'),{status:409});
    const ss=await c.query<any>(`SELECT * FROM operational_procedure_steps WHERE id=$1 AND organization_id=$2 LIMIT 1`,[run.current_step_id,input.organizationId]);const step=ss.rows[0];if(!step)throw Object.assign(new Error('Current procedure step not found.'),{status:409});
    const srq=await c.query<any>(`SELECT * FROM operational_step_runs WHERE procedure_run_id=$1 AND procedure_step_id=$2 AND organization_id=$3 FOR UPDATE`,[run.id,step.id,input.organizationId]);let stepRun=srq.rows[0];
    if(!stepRun){const ins=await c.query<any>(`INSERT INTO operational_step_runs(organization_id,project_id,procedure_run_id,procedure_step_id,status,expected_state,started_by,started_at) VALUES($1,$2,$3,$4,'READY',$5::jsonb,$6,now()) RETURNING *`,[input.organizationId,run.project_id,run.id,step.id,JSON.stringify(step.expected_state||{}),input.userId]);stepRun=ins.rows[0]}
    const expected=await evaluateExpected(input.organizationId,run.project_id,step,c);
    const machineRule=expected.machineEvaluated;const passed=machineRule?expected.status==='PASS':input.manualConfirmed;
    if(passed){
      await c.query(`UPDATE operational_step_runs SET status='VERIFIED',observed_state=$1::jsonb,verification_result=$2::jsonb,operator_note=$3,completed_by=$4,completed_at=now(),updated_at=now() WHERE id=$5`,[JSON.stringify({pointKey:expected.pointKey,value:expected.observed,quality:expected.quality,observedAt:expected.observedAt}),JSON.stringify(expected),input.note||null,input.userId,stepRun.id]);
      const advanced=await advanceAfterStep(c,{organizationId:input.organizationId,run,step,userId:input.userId});
      return{...advanced,runId:run.id,verifiedStep:step.step_code,verification:expected};
    }
    const severity=step.is_blocking?'BLOCK':'WARNING';
    await c.query(`UPDATE operational_step_runs SET status=$1,observed_state=$2::jsonb,verification_result=$3::jsonb,operator_note=$4,completed_by=$5,completed_at=now(),updated_at=now() WHERE id=$6`,[step.is_blocking?'BLOCKED':'FAILED',JSON.stringify({pointKey:expected.pointKey,value:expected.observed,quality:expected.quality,observedAt:expected.observedAt}),JSON.stringify(expected),input.note||null,input.userId,stepRun.id]);
    const ex=await c.query<any>(`INSERT INTO operational_exceptions(organization_id,project_id,asset_id,procedure_id,procedure_step_id,procedure_run_id,step_run_id,exception_type,severity,expected_state,actual_state,status,details) VALUES($1,$2,$3,$4,$5,$6,$7,'EXPECTED_ACTUAL_MISMATCH',$8,$9::jsonb,$10::jsonb,'OPEN',$11::jsonb) RETURNING id`,[input.organizationId,run.project_id,step.asset_id||null,run.procedure_id,step.id,run.id,stepRun.id,severity,JSON.stringify(step.expected_state||{}),JSON.stringify({pointKey:expected.pointKey,value:expected.observed,quality:expected.quality,observedAt:expected.observedAt}),JSON.stringify({verification:expected,operatorNote:input.note||null})]);
    if(step.failure_branch_step_code){
      const br=await c.query<any>(`SELECT id,step_code FROM operational_procedure_steps WHERE organization_id=$1 AND procedure_id=$2 AND step_code=$3 LIMIT 1`,[input.organizationId,run.procedure_id,step.failure_branch_step_code]);
      if(br.rows[0])await c.query(`UPDATE operational_procedure_runs SET status='BLOCKED',current_step_id=$1,updated_at=now() WHERE id=$2`,[br.rows[0].id,run.id]);else await c.query(`UPDATE operational_procedure_runs SET status='BLOCKED',updated_at=now() WHERE id=$1`,[run.id]);
      return{status:'BLOCKED' as const,runId:run.id,failedStep:step.step_code,failureBranch:step.failure_branch_step_code,exceptionId:ex.rows[0].id,verification:expected};
    }
    if(step.is_blocking){
      await c.query(`UPDATE operational_procedure_runs SET status='BLOCKED',updated_at=now() WHERE id=$1`,[run.id]);
      return{status:'BLOCKED' as const,runId:run.id,failedStep:step.step_code,failureBranch:null,exceptionId:ex.rows[0].id,verification:expected};
    }
    const advanced=await advanceAfterStep(c,{organizationId:input.organizationId,run,step,userId:input.userId});
    return{...advanced,runId:run.id,warningStep:step.step_code,exceptionId:ex.rows[0].id,verification:expected,nonBlockingWarning:true};
  });
}

export async function resumeProcedureRun(input:{organizationId:string;projectIds:string[];runId:string;userId:string}){
  return tx(async c=>{
    const rr=await c.query<any>(`SELECT * FROM operational_procedure_runs WHERE id=$1 AND organization_id=$2 AND project_id=ANY($3::uuid[]) FOR UPDATE`,[input.runId,input.organizationId,input.projectIds]);const run=rr.rows[0];if(!run)throw Object.assign(new Error('Procedure run not found.'),{status:404});if(run.status!=='BLOCKED')throw Object.assign(new Error('Only a BLOCKED run can be resumed.'),{status:409});if(!run.current_step_id)throw Object.assign(new Error('Blocked run has no failure/recovery step to resume.'),{status:409});
    const s=await c.query<any>(`SELECT * FROM operational_procedure_steps WHERE id=$1 AND organization_id=$2`,[run.current_step_id,input.organizationId]);const step=s.rows[0];if(!step)throw Object.assign(new Error('Recovery step not found.'),{status:409});const prereq=await evaluatePrerequisites(input.organizationId,run.project_id,step,c);if(!prereq.pass&&step.is_blocking)throw Object.assign(new Error('Recovery-step prerequisites are still not satisfied.'),{status:409});
    await c.query(`INSERT INTO operational_step_runs(organization_id,project_id,procedure_run_id,procedure_step_id,status,expected_state,verification_result,started_by,started_at) VALUES($1,$2,$3,$4,'READY',$5::jsonb,$6::jsonb,$7,now()) ON CONFLICT(procedure_run_id,procedure_step_id) DO UPDATE SET status='READY',verification_result=EXCLUDED.verification_result,updated_at=now()`,[input.organizationId,run.project_id,run.id,step.id,JSON.stringify(step.expected_state||{}),JSON.stringify({prerequisites:prereq.results,resumed:true}),input.userId]);
    await c.query(`UPDATE operational_procedure_runs SET status='RUNNING',updated_at=now() WHERE id=$1`,[run.id]);return{status:'RUNNING',runId:run.id,currentStep:step.step_code};
  });
}

export async function abortProcedureRun(input:{organizationId:string;projectIds:string[];runId:string;userId:string;reason?:string}){
  const r=await query<any>(`UPDATE operational_procedure_runs SET status='ABORTED',aborted_at=now(),updated_at=now(),context=context||$1::jsonb WHERE id=$2 AND organization_id=$3 AND project_id=ANY($4::uuid[]) AND status IN ('READY','RUNNING','BLOCKED') RETURNING id::text,project_id::text,procedure_id::text,status`,[JSON.stringify({abortedBy:input.userId,abortReason:input.reason||null}),input.runId,input.organizationId,input.projectIds]);if(!r.rows[0])throw Object.assign(new Error('Procedure run is not abortable or was not found.'),{status:409});return r.rows[0];
}
