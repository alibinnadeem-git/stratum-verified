import {query,tx} from './db';
import {
  TELEMETRY_AUTHORITY,
  TELEMETRY_TRUTH_BOUNDARY,
  deterministicTelemetryIdempotencyKey,
  normalizeTelemetryQuality,
  normalizeTelemetryValue,
  observationConfidence,
  type TelemetryAdapter,
  type TelemetryQuality,
  type TelemetryValueType
} from '../telemetry-contract';

export type RawTelemetrySample={
  externalPointKey:string;
  value:unknown;
  quality?:unknown;
  observedAt:string;
  idempotencyKey?:string;
};

type BindingRow={
  id:string;
  organization_id:string;
  project_id:string;
  source_id:string;
  external_point_key:string;
  semantic_key:string;
  asset_id:string;
  touchpoint_id:string|null;
  value_type:TelemetryValueType;
  engineering_unit:string|null;
  multiplier:string|number;
  offset_value:string|number;
  stale_after_seconds:number|null;
  mapping_confidence:string|number;
  mapping_evidence:unknown;
  source_ref:unknown;
  dependency_ids:string[]|null;
};

type SourceRow={id:string;project_id:string;source_code:string;display_name:string;adapter_type:TelemetryAdapter;status:string};

export async function telemetrySchemaReady(){
  const r=await query<{ready:boolean}>(`SELECT to_regclass('public.telemetry_sources') IS NOT NULL AND to_regclass('public.telemetry_point_bindings') IS NOT NULL AND to_regclass('public.telemetry_binding_dependencies') IS NOT NULL AND to_regclass('public.operational_live_iterations') IS NOT NULL AS ready`);
  return !!r.rows[0]?.ready;
}

export async function ingestTelemetryBatch(input:{organizationId:string;sourceCode:string;samples:RawTelemetrySample[]}){
  if(!(await telemetrySchemaReady()))throw Object.assign(new Error('Telemetry database migration 009 has not been applied yet.'),{status:503});
  const sourceResult=await query<SourceRow>(`SELECT id::text,project_id::text,source_code,display_name,adapter_type,status FROM telemetry_sources WHERE organization_id=$1 AND source_code=$2 LIMIT 1`,[input.organizationId,input.sourceCode]);
  const source=sourceResult.rows[0];
  if(!source)throw Object.assign(new Error('Telemetry source not found in this organization.'),{status:404});
  if(source.status!=='ACTIVE')throw Object.assign(new Error(`Telemetry source is ${source.status}; only ACTIVE sources may ingest observations.`),{status:409});

  const keys=[...new Set(input.samples.map(x=>x.externalPointKey))];
  const bindings=keys.length?await query<BindingRow>(`SELECT b.id::text,b.organization_id::text,b.project_id::text,b.source_id::text,b.external_point_key,b.semantic_key,b.asset_id::text,b.touchpoint_id::text,b.value_type,b.engineering_unit,b.multiplier,b.offset_value,b.stale_after_seconds,b.mapping_confidence,b.mapping_evidence,b.source_ref,ARRAY(SELECT d.dependency_id::text FROM telemetry_binding_dependencies d WHERE d.binding_id=b.id AND d.organization_id=b.organization_id AND d.project_id=b.project_id ORDER BY d.dependency_id)::text[] dependency_ids FROM telemetry_point_bindings b JOIN assets a ON a.id=b.asset_id AND a.organization_id=b.organization_id AND a.project_id=b.project_id LEFT JOIN operational_touchpoints t ON t.id=b.touchpoint_id AND t.organization_id=b.organization_id AND t.project_id=b.project_id WHERE b.organization_id=$1 AND b.project_id=$2 AND b.source_id=$3 AND b.external_point_key=ANY($4::text[]) AND b.status='APPROVED'`,[input.organizationId,source.project_id,source.id,keys]):{rows:[]} as {rows:BindingRow[]};
  const byKey=new Map(bindings.rows.map(b=>[b.external_point_key,b]));
  const receivedAt=new Date();
  const prepared:{sample:RawTelemetrySample;binding:BindingRow;quality:TelemetryQuality;value:unknown;confidence:number;idempotencyKey:string}[]=[];
  const rejected:{externalPointKey:string;reason:string}[]=[];

  for(const sample of input.samples){
    const binding=byKey.get(sample.externalPointKey);
    if(!binding){rejected.push({externalPointKey:sample.externalPointKey,reason:'UNMAPPED_OR_UNAPPROVED'});continue;}
    const observedAt=new Date(sample.observedAt);
    if(!Number.isFinite(observedAt.getTime())){rejected.push({externalPointKey:sample.externalPointKey,reason:'INVALID_TIMESTAMP'});continue;}
    try{
      const quality=normalizeTelemetryQuality(sample.quality,observedAt,receivedAt,binding.stale_after_seconds);
      const value=normalizeTelemetryValue(sample.value,binding.value_type,Number(binding.multiplier),Number(binding.offset_value));
      const confidence=observationConfidence(Number(binding.mapping_confidence),quality);
      const idempotencyKey=sample.idempotencyKey?.trim()||deterministicTelemetryIdempotencyKey({sourceCode:source.source_code,externalPointKey:sample.externalPointKey,observedAt:observedAt.toISOString(),value:sample.value});
      prepared.push({sample:{...sample,observedAt:observedAt.toISOString()},binding,quality,value,confidence,idempotencyKey});
    }catch(error){rejected.push({externalPointKey:sample.externalPointKey,reason:error instanceof Error?error.message:'NORMALIZATION_FAILED'});}
  }

  const result=await tx(async client=>{
    const accepted:any[]=[];const duplicates:any[]=[];
    for(const item of prepared){
      const b=item.binding;
      const topologyDependencyIds=b.dependency_ids||[];
      const sourceRef={...(b.source_ref&&typeof b.source_ref==='object'&&!Array.isArray(b.source_ref)?b.source_ref as Record<string,unknown>:{}),adapterType:source.adapter_type,sourceCode:source.source_code,externalPointKey:item.sample.externalPointKey,bindingId:b.id,topologyDependencyIds,truthBoundary:TELEMETRY_TRUTH_BOUNDARY};
      const metadata={rawQuality:item.sample.quality??null,mappingEvidence:b.mapping_evidence,topologyDependencyIds,authority:TELEMETRY_AUTHORITY,controlAuthority:false,verifiedBaselineMutation:false};
      const inserted=await client.query<any>(`INSERT INTO operational_observations(organization_id,project_id,asset_id,touchpoint_id,source_system,point_key,value_json,quality,observed_at,received_at,telemetry_source_id,telemetry_binding_id,semantic_key,engineering_unit,confidence,source_ref,idempotency_key,metadata) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,$17,$18::jsonb) ON CONFLICT (organization_id,idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING RETURNING id::text,observed_at,received_at`,[input.organizationId,source.project_id,b.asset_id,b.touchpoint_id,source.source_code,b.semantic_key,JSON.stringify(item.value),item.quality,new Date(item.sample.observedAt),receivedAt,source.id,b.id,b.semantic_key,b.engineering_unit,item.confidence,JSON.stringify(sourceRef),item.idempotencyKey,JSON.stringify(metadata)]);
      if(!inserted.rows[0]){
        const existing=await client.query<{id:string}>(`SELECT id::text FROM operational_observations WHERE organization_id=$1 AND idempotency_key=$2 LIMIT 1`,[input.organizationId,item.idempotencyKey]);
        duplicates.push({externalPointKey:item.sample.externalPointKey,semanticKey:b.semantic_key,observationId:existing.rows[0]?.id||null,idempotencyKey:item.idempotencyKey,topologyDependencyIds});
        continue;
      }
      const observationId=inserted.rows[0].id;
      await client.query(`INSERT INTO operational_live_iterations(organization_id,project_id,asset_id,touchpoint_id,observation_id,telemetry_binding_id,semantic_key,normalized_value_json,engineering_unit,quality,confidence,observed_at,received_at,authority,control_authority,verified_baseline_mutation,mapping_evidence,source_ref,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$13,$14,false,false,$15::jsonb,$16::jsonb,$17::jsonb) ON CONFLICT(observation_id) DO NOTHING`,[input.organizationId,source.project_id,b.asset_id,b.touchpoint_id,observationId,b.id,b.semantic_key,JSON.stringify(item.value),b.engineering_unit,item.quality,item.confidence,new Date(item.sample.observedAt),receivedAt,TELEMETRY_AUTHORITY,JSON.stringify(b.mapping_evidence??[]),JSON.stringify(sourceRef),JSON.stringify(metadata)]);
      accepted.push({externalPointKey:item.sample.externalPointKey,semanticKey:b.semantic_key,assetId:b.asset_id,touchpointId:b.touchpoint_id,topologyDependencyIds,observationId,quality:item.quality,confidence:item.confidence,engineeringUnit:b.engineering_unit,idempotencyKey:item.idempotencyKey});
    }
    return{accepted,duplicates};
  });

  return{
    source:{id:source.id,sourceCode:source.source_code,adapterType:source.adapter_type,projectId:source.project_id},
    authority:TELEMETRY_AUTHORITY,
    truthBoundary:TELEMETRY_TRUTH_BOUNDARY,
    accepted:result.accepted,
    duplicates:result.duplicates,
    rejected,
    summary:{accepted:result.accepted.length,duplicates:result.duplicates.length,rejected:rejected.length}
  };
}
