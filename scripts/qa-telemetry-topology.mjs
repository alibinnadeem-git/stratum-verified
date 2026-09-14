import assert from 'node:assert/strict';
import fs from 'node:fs';

const config=fs.readFileSync(new URL('../app/api/telemetry/config/route.ts',import.meta.url),'utf8');
const ingest=fs.readFileSync(new URL('../lib/server/telemetry.ts',import.meta.url),'utf8');
const migration=fs.readFileSync(new URL('../migrations/009_telemetry_semantic_binding.sql',import.meta.url),'utf8');

for(const required of [
  'CREATE TABLE IF NOT EXISTS telemetry_binding_dependencies',
  'REFERENCES telemetry_point_bindings(id) ON DELETE CASCADE',
  'REFERENCES operational_dependencies(id) ON DELETE CASCADE',
  'PRIMARY KEY (binding_id, dependency_id)',
  'does not create a second graph'
])assert.ok(migration.includes(required),`Missing telemetry topology schema invariant: ${required}`);

for(const required of [
  'dependencyIds:z.array(z.string().uuid()).max(100).default([])',
  'const dependencyIds=[...new Set(body.dependencyIds)]',
  'const created=await tx(async client=>',
  'FROM operational_dependencies WHERE organization_id=$1 AND project_id=$2 AND id=ANY($3::uuid[]) FOR SHARE',
  'Every topology dependency must belong to the same organization and project as the telemetry binding.',
  'does not touch the mapped STRATUM Asset.',
  'INSERT INTO telemetry_binding_dependencies(binding_id,dependency_id,organization_id,project_id)',
  'dependencyIds,status:\'DRAFT\''
])assert.ok(config.includes(required),`Missing atomic telemetry binding invariant: ${required}`);

const bindingInsert=config.indexOf('INSERT INTO telemetry_point_bindings');
const topologyInsert=config.indexOf('INSERT INTO telemetry_binding_dependencies');
const transactionStart=config.indexOf('const created=await tx(async client=>');
assert.ok(transactionStart>=0&&bindingInsert>transactionStart&&topologyInsert>bindingInsert,'Binding and canonical-topology links must be written inside the same transaction.');

for(const required of [
  "to_regclass('public.telemetry_binding_dependencies') IS NOT NULL",
  'ARRAY(SELECT d.dependency_id::text FROM telemetry_binding_dependencies',
  'const topologyDependencyIds=b.dependency_ids||[]',
  'topologyDependencyIds,truthBoundary:TELEMETRY_TRUTH_BOUNDARY',
  'mappingEvidence:b.mapping_evidence,topologyDependencyIds,authority:TELEMETRY_AUTHORITY',
  'verifiedBaselineMutation:false',
  'controlAuthority:false'
])assert.ok(ingest.includes(required),`Missing telemetry provenance invariant: ${required}`);

for(const forbidden of [
  'UPDATE assets SET',
  'UPDATE lifecycle_events SET',
  'controlAuthority:true',
  'verifiedBaselineMutation:true',
  'PROPOSE',
  'ROUND_CHANGE',
  'CANDIDATE→ACTIVE'
]){
  assert.ok(!config.includes(forbidden),`Configuration path must not gain infrastructure/PoVI mutation authority: ${forbidden}`);
  assert.ok(!ingest.includes(forbidden),`Ingestion path must not gain infrastructure/PoVI mutation authority: ${forbidden}`);
}

console.log('STRATUM telemetry topology binding QA passed');
