import assert from 'node:assert/strict';

const telemetry=await import(new URL('../lib/telemetry-contract.ts',import.meta.url).href);
const now=new Date('2026-09-14T03:30:00.000Z');

assert.equal(telemetry.TELEMETRY_AUTHORITY,'OBSERVATIONAL_ONLY');
assert.equal(telemetry.TELEMETRY_TRUTH_BOUNDARY,'LIVE_ITERATIONS_NEVER_OVERWRITE_VERIFIED');

assert.equal(telemetry.normalizeTelemetryQuality('GOOD',now,now,60),'GOOD');
assert.equal(telemetry.normalizeTelemetryQuality('degraded',now,now,60),'UNCERTAIN');
assert.equal(telemetry.normalizeTelemetryQuality('FAULT',now,now,60),'BAD');
assert.equal(telemetry.normalizeTelemetryQuality(0x00000000,now,now,60),'GOOD');
assert.equal(telemetry.normalizeTelemetryQuality(0x40000000,now,now,60),'UNCERTAIN');
assert.equal(telemetry.normalizeTelemetryQuality(0x80000000,now,now,60),'BAD');
assert.equal(telemetry.normalizeTelemetryQuality(0xC0000000,now,now,60),'BAD');
assert.equal(telemetry.normalizeTelemetryQuality('GOOD',new Date(now.getTime()-61_000),now,60),'STALE');

assert.equal(telemetry.normalizeTelemetryValue('3000','NUMBER',1,.5),3000.5);
assert.equal(telemetry.normalizeTelemetryValue('ON','BOOLEAN'),true);
assert.equal(telemetry.normalizeTelemetryValue('closed','BOOLEAN'),false);
assert.equal(telemetry.normalizeTelemetryValue(42,'STRING'),'42');
assert.deepEqual(telemetry.normalizeTelemetryValue({z:1,a:2},'JSON'),{a:2,z:1});
assert.throws(()=>telemetry.normalizeTelemetryValue('not-a-number','NUMBER'));
assert.throws(()=>telemetry.normalizeTelemetryValue('MAYBE','BOOLEAN'));

assert.equal(telemetry.observationConfidence(.9,'GOOD'),.9);
assert.equal(telemetry.observationConfidence(.9,'UNCERTAIN'),.585);
assert.equal(telemetry.observationConfidence(.9,'STALE'),.36);
assert.equal(telemetry.observationConfidence(.9,'BAD'),.135);

const a=telemetry.deterministicTelemetryIdempotencyKey({sourceCode:'EPMS-01',externalPointKey:'swgr.current',observedAt:now.toISOString(),value:{b:2,a:1}});
const b=telemetry.deterministicTelemetryIdempotencyKey({sourceCode:'EPMS-01',externalPointKey:'swgr.current',observedAt:now.toISOString(),value:{a:1,b:2}});
assert.equal(a,b,'Idempotency must be independent of JSON object key order.');
assert.equal(a.length,64);

console.log('STRATUM telemetry semantic contract QA passed');
