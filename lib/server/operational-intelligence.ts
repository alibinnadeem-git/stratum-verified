import {query} from './db';

export type OperationalOverview={schemaReady:boolean;touchpointCount:number;procedureCount:number;approvedProcedureCount:number;dependencyCount:number;observationCount:number;openExceptionCount:number;criticalExceptionCount:number;latestObservationAt:string|null};

export async function operationalSchemaReady(){
  const r=await query<{ready:boolean}>(`SELECT to_regclass('public.operational_touchpoints') IS NOT NULL AND to_regclass('public.operational_procedures') IS NOT NULL AND to_regclass('public.operational_dependencies') IS NOT NULL AND to_regclass('public.operational_observations') IS NOT NULL AS ready`);
  return !!r.rows[0]?.ready;
}

export async function operationalOverview(organizationId:string,projectIds:string[]):Promise<OperationalOverview>{
  if(!projectIds.length)return{schemaReady:await operationalSchemaReady(),touchpointCount:0,procedureCount:0,approvedProcedureCount:0,dependencyCount:0,observationCount:0,openExceptionCount:0,criticalExceptionCount:0,latestObservationAt:null};
  const ready=await operationalSchemaReady();
  if(!ready)return{schemaReady:false,touchpointCount:0,procedureCount:0,approvedProcedureCount:0,dependencyCount:0,observationCount:0,openExceptionCount:0,criticalExceptionCount:0,latestObservationAt:null};
  const r=await query<any>(`SELECT
    (SELECT count(*)::int FROM operational_touchpoints WHERE organization_id=$1 AND project_id=ANY($2::uuid[])) touchpoints,
    (SELECT count(*)::int FROM operational_procedures WHERE organization_id=$1 AND project_id=ANY($2::uuid[])) procedures,
    (SELECT count(*)::int FROM operational_procedures WHERE organization_id=$1 AND project_id=ANY($2::uuid[]) AND status='APPROVED') approved_procedures,
    (SELECT count(*)::int FROM operational_dependencies WHERE organization_id=$1 AND project_id=ANY($2::uuid[])) dependencies,
    (SELECT count(*)::int FROM operational_observations WHERE organization_id=$1 AND project_id=ANY($2::uuid[])) observations,
    (SELECT count(*)::int FROM operational_exceptions WHERE organization_id=$1 AND project_id=ANY($2::uuid[]) AND status<>'RESOLVED') open_exceptions,
    (SELECT count(*)::int FROM operational_exceptions WHERE organization_id=$1 AND project_id=ANY($2::uuid[]) AND status<>'RESOLVED' AND severity IN ('CRITICAL','BLOCK')) critical_exceptions,
    (SELECT max(observed_at)::text FROM operational_observations WHERE organization_id=$1 AND project_id=ANY($2::uuid[])) latest_observation_at`,[organizationId,projectIds]);
  const x=r.rows[0]||{};
  return{schemaReady:true,touchpointCount:x.touchpoints||0,procedureCount:x.procedures||0,approvedProcedureCount:x.approved_procedures||0,dependencyCount:x.dependencies||0,observationCount:x.observations||0,openExceptionCount:x.open_exceptions||0,criticalExceptionCount:x.critical_exceptions||0,latestObservationAt:x.latest_observation_at||null};
}

export async function operationalTouchpoints(organizationId:string,projectIds:string[]){
  if(!projectIds.length||!(await operationalSchemaReady()))return[];
  const r=await query<any>(`SELECT t.id::text,t.project_id::text,t.asset_id::text,t.touchpoint_code,t.name,t.touchpoint_type,t.current_state,t.permitted_actions,t.restricted_actions,t.required_role,t.authorization_level,t.loto_required,t.hazards,t.interlocks,t.updated_at,a.asset_code,a.name asset_name,a.asset_type,p.project_code,p.name project_name FROM operational_touchpoints t JOIN assets a ON a.id=t.asset_id AND a.organization_id=t.organization_id JOIN projects p ON p.id=t.project_id AND p.organization_id=t.organization_id WHERE t.organization_id=$1 AND t.project_id=ANY($2::uuid[]) ORDER BY t.updated_at DESC LIMIT 300`,[organizationId,projectIds]);
  return r.rows;
}

export async function operationalProcedures(organizationId:string,projectIds:string[]){
  if(!projectIds.length||!(await operationalSchemaReady()))return[];
  const r=await query<any>(`SELECT p.id::text,p.project_id::text,p.procedure_code,p.procedure_type,p.title,p.purpose,p.version,p.status,p.source_refs,p.approved_at,p.updated_at,pr.project_code,pr.name project_name,(SELECT count(*)::int FROM operational_procedure_steps s WHERE s.procedure_id=p.id AND s.organization_id=p.organization_id) step_count,(SELECT count(*)::int FROM operational_procedure_steps s WHERE s.procedure_id=p.id AND s.organization_id=p.organization_id AND s.touchpoint_id IS NOT NULL) touchpoint_step_count FROM operational_procedures p JOIN projects pr ON pr.id=p.project_id AND pr.organization_id=p.organization_id WHERE p.organization_id=$1 AND p.project_id=ANY($2::uuid[]) ORDER BY p.updated_at DESC LIMIT 300`,[organizationId,projectIds]);
  return r.rows;
}

export async function operationalDependencies(organizationId:string,projectIds:string[]){
  if(!projectIds.length||!(await operationalSchemaReady()))return[];
  const r=await query<any>(`SELECT d.id::text,d.project_id::text,d.source_asset_id::text,d.target_asset_id::text,d.relationship_type,d.criticality,d.source_ref,sa.asset_code source_asset_code,sa.name source_asset_name,ta.asset_code target_asset_code,ta.name target_asset_name,p.project_code,p.name project_name FROM operational_dependencies d JOIN assets sa ON sa.id=d.source_asset_id AND sa.organization_id=d.organization_id JOIN assets ta ON ta.id=d.target_asset_id AND ta.organization_id=d.organization_id JOIN projects p ON p.id=d.project_id AND p.organization_id=d.organization_id WHERE d.organization_id=$1 AND d.project_id=ANY($2::uuid[]) ORDER BY CASE d.criticality WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'NORMAL' THEN 3 ELSE 4 END,d.created_at DESC LIMIT 500`,[organizationId,projectIds]);
  return r.rows;
}

export async function operationalExceptions(organizationId:string,projectIds:string[]){
  if(!projectIds.length||!(await operationalSchemaReady()))return[];
  const r=await query<any>(`SELECT e.id::text,e.project_id::text,e.asset_id::text,e.exception_type,e.severity,e.expected_state,e.actual_state,e.status,e.details,e.created_at,a.asset_code,a.name asset_name,p.project_code,p.name project_name FROM operational_exceptions e LEFT JOIN assets a ON a.id=e.asset_id AND a.organization_id=e.organization_id JOIN projects p ON p.id=e.project_id AND p.organization_id=e.organization_id WHERE e.organization_id=$1 AND e.project_id=ANY($2::uuid[]) AND e.status<>'RESOLVED' ORDER BY CASE e.severity WHEN 'BLOCK' THEN 1 WHEN 'CRITICAL' THEN 2 WHEN 'WARNING' THEN 3 ELSE 4 END,e.created_at DESC LIMIT 200`,[organizationId,projectIds]);
  return r.rows;
}

export async function latestOperationalObservations(organizationId:string,projectIds:string[]){
  if(!projectIds.length||!(await operationalSchemaReady()))return[];
  const r=await query<any>(`SELECT DISTINCT ON (o.asset_id,o.point_key) o.id::text,o.project_id::text,o.asset_id::text,o.touchpoint_id::text,o.source_system,o.point_key,o.value_json,o.quality,o.observed_at,o.received_at,a.asset_code,a.name asset_name,p.project_code,p.name project_name FROM operational_observations o JOIN assets a ON a.id=o.asset_id AND a.organization_id=o.organization_id JOIN projects p ON p.id=o.project_id AND p.organization_id=o.organization_id WHERE o.organization_id=$1 AND o.project_id=ANY($2::uuid[]) ORDER BY o.asset_id,o.point_key,o.observed_at DESC LIMIT 500`,[organizationId,projectIds]);
  return r.rows.sort((a,b)=>+new Date(b.observed_at)-+new Date(a.observed_at));
}

export async function impactAnalysis(organizationId:string,projectIds:string[],assetId:string,direction:'DOWNSTREAM'|'UPSTREAM'='DOWNSTREAM'){
  if(!projectIds.length||!(await operationalSchemaReady()))return{schemaReady:false,root:null,items:[]};
  const root=await query<any>(`SELECT a.id::text,a.asset_code,a.name,a.asset_type,p.project_code,p.name project_name FROM assets a JOIN projects p ON p.id=a.project_id WHERE a.organization_id=$1 AND a.project_id=ANY($2::uuid[]) AND a.id=$3 LIMIT 1`,[organizationId,projectIds,assetId]);
  if(!root.rows[0])return{schemaReady:true,root:null,items:[]};
  const forward=direction==='DOWNSTREAM';
  const firstFrom=forward?'d.source_asset_id':'d.target_asset_id';
  const firstTo=forward?'d.target_asset_id':'d.source_asset_id';
  const nextFrom=forward?'d.source_asset_id':'d.target_asset_id';
  const nextTo=forward?'d.target_asset_id':'d.source_asset_id';
  const r=await query<any>(`WITH RECURSIVE impact AS (
    SELECT ${firstFrom} from_asset_id,${firstTo} to_asset_id,d.relationship_type,d.criticality,1 depth,ARRAY[${firstFrom},${firstTo}]::uuid[] path
      FROM operational_dependencies d
      WHERE d.organization_id=$1 AND d.project_id=ANY($2::uuid[]) AND ${firstFrom}=$3
    UNION ALL
    SELECT ${nextFrom},${nextTo},d.relationship_type,d.criticality,i.depth+1,i.path||${nextTo}
      FROM operational_dependencies d JOIN impact i ON ${nextFrom}=i.to_asset_id
      WHERE d.organization_id=$1 AND d.project_id=ANY($2::uuid[]) AND i.depth<12 AND NOT (${nextTo}=ANY(i.path))
  )
  SELECT DISTINCT ON (i.to_asset_id) i.to_asset_id::text asset_id,i.relationship_type,i.criticality,i.depth,a.asset_code,a.name,a.asset_type,p.project_code,p.name project_name
    FROM impact i JOIN assets a ON a.id=i.to_asset_id AND a.organization_id=$1 JOIN projects p ON p.id=a.project_id
    ORDER BY i.to_asset_id,i.depth ASC`,[organizationId,projectIds,assetId]);
  return{schemaReady:true,root:root.rows[0],items:r.rows.sort((a,b)=>a.depth-b.depth)};
}
