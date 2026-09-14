import {createHash} from 'node:crypto';

export const TELEMETRY_AUTHORITY='OBSERVATIONAL_ONLY' as const;
export const TELEMETRY_TRUTH_BOUNDARY='LIVE_ITERATIONS_NEVER_OVERWRITE_VERIFIED' as const;
export type TelemetryAdapter='EPMS'|'BMS'|'DCIM'|'SCADA'|'PLC'|'OPC_UA'|'GENERIC';
export type TelemetryQuality='GOOD'|'UNCERTAIN'|'BAD'|'STALE';
export type TelemetryValueType='NUMBER'|'BOOLEAN'|'STRING'|'JSON';

function stable(value:unknown):unknown{
  if(Array.isArray(value))return value.map(stable);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,stable(v)]));
  return value;
}

export function deterministicTelemetryIdempotencyKey(input:{sourceCode:string;externalPointKey:string;observedAt:string;value:unknown}){
  return createHash('sha256').update(JSON.stringify(stable(input))).digest('hex');
}

function statusClassFromNumber(raw:number):TelemetryQuality{
  const severity=(raw>>>30)&0b11;
  if(severity===0b10||severity===0b11)return'BAD';
  if(severity===0b01)return'UNCERTAIN';
  return'GOOD';
}

export function normalizeTelemetryQuality(raw:unknown,observedAt:Date,receivedAt:Date,staleAfterSeconds:number|null):TelemetryQuality{
  if(staleAfterSeconds&&receivedAt.getTime()-observedAt.getTime()>staleAfterSeconds*1000)return'STALE';
  if(typeof raw==='number'&&Number.isFinite(raw))return statusClassFromNumber(raw);
  const text=String(raw??'GOOD').trim().toUpperCase().replace(/[\s-]+/g,'_');
  if(['GOOD','OK','VALID','NORMAL','HEALTHY','ONLINE'].includes(text))return'GOOD';
  if(['STALE','TIMEOUT','OLD','EXPIRED','DISCONNECTED'].includes(text))return'STALE';
  if(['BAD','INVALID','FAULT','FAILED','FAIL','ERROR','OFFLINE'].includes(text))return'BAD';
  if(['UNCERTAIN','WARNING','WARN','QUESTIONABLE','DEGRADED','UNKNOWN'].includes(text))return'UNCERTAIN';
  return'UNCERTAIN';
}

export function normalizeTelemetryValue(value:unknown,valueType:TelemetryValueType,multiplier=1,offset=0):unknown{
  if(valueType==='JSON')return stable(value);
  if(valueType==='STRING'){
    if(value===null||value===undefined)throw Object.assign(new Error('Telemetry string value is missing.'),{status:400});
    return String(value);
  }
  if(valueType==='BOOLEAN'){
    if(typeof value==='boolean')return value;
    if(typeof value==='number'&&(value===0||value===1))return value===1;
    const text=String(value).trim().toUpperCase();
    if(['TRUE','1','ON','OPEN','RUNNING','ACTIVE'].includes(text))return true;
    if(['FALSE','0','OFF','CLOSED','STOPPED','INACTIVE'].includes(text))return false;
    throw Object.assign(new Error(`Telemetry boolean value ${JSON.stringify(value)} is not recognized.`),{status:400});
  }
  const n=typeof value==='number'?value:Number(value);
  if(!Number.isFinite(n))throw Object.assign(new Error(`Telemetry numeric value ${JSON.stringify(value)} is not finite.`),{status:400});
  const out=n*multiplier+offset;
  if(!Number.isFinite(out))throw Object.assign(new Error('Telemetry engineering conversion produced a non-finite value.'),{status:400});
  return out;
}

function qualityFactor(quality:TelemetryQuality){
  if(quality==='GOOD')return 1;
  if(quality==='UNCERTAIN')return .65;
  if(quality==='STALE')return .4;
  return .15;
}

export function observationConfidence(mappingConfidence:number,quality:TelemetryQuality){
  return Number(Math.max(0,Math.min(1,mappingConfidence*qualityFactor(quality))).toFixed(4));
}
