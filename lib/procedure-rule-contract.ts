export type RuleResult={status:'PASS'|'FAIL'|'NO_DATA'|'MANUAL';machineEvaluated:boolean;reason:string;pointKey?:string;expected?:unknown;observed?:unknown;quality?:string;observedAt?:string};

function same(a:unknown,b:unknown){return JSON.stringify(a)===JSON.stringify(b)}
function asNumber(v:unknown){const n=typeof v==='number'?v:Number(v);return Number.isFinite(n)?n:null}

export function evaluateObservationRule(rule:any,observation:any|null,nowMs=Date.now()):RuleResult{
  if(!rule||typeof rule!=='object'||Array.isArray(rule)||!Object.keys(rule).length)return{status:'MANUAL',machineEvaluated:false,reason:'No machine-verifiable rule defined.'};
  const pointKey=typeof rule.pointKey==='string'?rule.pointKey:undefined;
  if(!pointKey)return{status:'MANUAL',machineEvaluated:false,reason:'Rule has no pointKey; human verification is required.'};
  if(!observation)return{status:'NO_DATA',machineEvaluated:true,reason:`No observation is available for ${pointKey}.`,pointKey};
  const observed=observation.value_json;
  const quality=String(observation.quality||'').toUpperCase();
  const observedAt=new Date(observation.observed_at).toISOString();

  if(quality==='BAD'||quality==='STALE')return{status:'FAIL',machineEvaluated:true,reason:`Observation quality ${quality} cannot satisfy a governed machine rule.`,pointKey,observed,quality,observedAt};
  if(quality==='UNCERTAIN'&&!Array.isArray(rule.qualityIn))return{status:'FAIL',machineEvaluated:true,reason:'UNCERTAIN observation requires an explicit qualityIn policy before it can satisfy a governed machine rule.',pointKey,observed,quality,observedAt};
  if(Array.isArray(rule.qualityIn)&&!rule.qualityIn.includes(quality))return{status:'FAIL',machineEvaluated:true,reason:`Observation quality ${quality} is not allowed.`,pointKey,observed,quality,observedAt};
  if(typeof rule.maxAgeSeconds==='number'){
    const age=(nowMs-new Date(observation.observed_at).getTime())/1000;
    if(age>rule.maxAgeSeconds)return{status:'FAIL',machineEvaluated:true,reason:`Observation is stale (${Math.round(age)}s old; maximum ${rule.maxAgeSeconds}s).`,pointKey,observed,quality,observedAt};
  }
  const expected=Object.prototype.hasOwnProperty.call(rule,'equals')?rule.equals:Object.prototype.hasOwnProperty.call(rule,'value')?rule.value:undefined;
  let pass=true;let checks=0;const reasons:string[]=[];
  if(expected!==undefined){checks++;const ok=same(observed,expected);pass=pass&&ok;reasons.push(ok?`equals ${JSON.stringify(expected)}`:`expected ${JSON.stringify(expected)}, observed ${JSON.stringify(observed)}`)}
  if(Array.isArray(rule.oneOf)){checks++;const ok=rule.oneOf.some((x:unknown)=>same(x,observed));pass=pass&&ok;reasons.push(ok?'value is in allowed set':`observed ${JSON.stringify(observed)} is not in allowed set`)}
  if(rule.min!==undefined){checks++;const n=asNumber(observed),min=asNumber(rule.min);const ok=n!==null&&min!==null&&n>=min;pass=pass&&ok;reasons.push(ok?`>= ${rule.min}`:`expected >= ${rule.min}, observed ${JSON.stringify(observed)}`)}
  if(rule.max!==undefined){checks++;const n=asNumber(observed),max=asNumber(rule.max);const ok=n!==null&&max!==null&&n<=max;pass=pass&&ok;reasons.push(ok?`<= ${rule.max}`:`expected <= ${rule.max}, observed ${JSON.stringify(observed)}`)}
  if(!checks)return{status:'MANUAL',machineEvaluated:false,reason:'Rule identifies a point but defines no comparison; human verification is required.',pointKey,observed,quality,observedAt};
  return{status:pass?'PASS':'FAIL',machineEvaluated:true,reason:reasons.join('; '),pointKey,expected,observed,quality,observedAt};
}
