export const lifecycleEventTypes=[
  'REGISTER_ASSET','PROCURE','SHIP','TRANSFER_CUSTODY','RECEIVE','INSTALL','INSPECT','TEST','COMMISSION','ENERGIZE','MAINTAIN','REPAIR','REPLACE','DECOMMISSION'
] as const;

export type LifecycleEventType=typeof lifecycleEventTypes[number];
export type LifecycleEventStatus='SUBMITTED'|'VERIFIED'|'REJECTED'|string;
export type LifecycleEventSnapshot={event_type:LifecycleEventType|string;status:LifecycleEventStatus};

const repeatable=new Set<LifecycleEventType>(['SHIP','TRANSFER_CUSTODY','INSPECT','TEST','MAINTAIN','REPAIR']);
const preInstallOnly=new Set<LifecycleEventType>(['PROCURE','SHIP','RECEIVE']);

const requirements:Partial<Record<LifecycleEventType,LifecycleEventType[][]>>={
  PROCURE:[['REGISTER_ASSET']],
  SHIP:[['REGISTER_ASSET']],
  TRANSFER_CUSTODY:[['REGISTER_ASSET']],
  RECEIVE:[['REGISTER_ASSET']],
  INSTALL:[['REGISTER_ASSET'],['RECEIVE']],
  INSPECT:[['INSTALL']],
  TEST:[['INSTALL']],
  COMMISSION:[['INSTALL'],['INSPECT'],['TEST']],
  ENERGIZE:[['COMMISSION']],
  MAINTAIN:[['COMMISSION','ENERGIZE']],
  REPAIR:[['INSTALL']],
  REPLACE:[['INSTALL']],
  DECOMMISSION:[['INSTALL']]
};

const descriptions:Record<LifecycleEventType,string>={
  REGISTER_ASSET:'Establish the durable STRATUM identity for the physical asset.',
  PROCURE:'Record procurement or owner-furnished acquisition context.',
  SHIP:'Record shipment of the identified asset.',
  TRANSFER_CUSTODY:'Record a custody handoff without changing asset identity.',
  RECEIVE:'Confirm physical receipt and identity at the project/site.',
  INSTALL:'Record physical installation against the approved site/system.',
  INSPECT:'Record independent installation or quality inspection.',
  TEST:'Record required field or functional testing.',
  COMMISSION:'Confirm commissioning after installation, inspection and testing.',
  ENERGIZE:'Record controlled energization after commissioning.',
  MAINTAIN:'Record preventive or condition-based maintenance.',
  REPAIR:'Record corrective work while preserving provenance.',
  REPLACE:'Record replacement of the installed asset/component.',
  DECOMMISSION:'Close the asset lifecycle and prevent further operational events.'
};

function isType(value:string):value is LifecycleEventType{return (lifecycleEventTypes as readonly string[]).includes(value)}

/**
 * Existing production records pre-date the strict workflow gate. A later verified
 * milestone is therefore allowed to satisfy earlier transition prerequisites for
 * workflow continuity, without pretending those earlier proofs exist publicly.
 */
function inferredFromLater(actual:Set<LifecycleEventType>){
  const effective=new Set(actual);
  const imply=(event:LifecycleEventType,prereqs:LifecycleEventType[])=>{if(effective.has(event))prereqs.forEach(x=>effective.add(x))};
  imply('DECOMMISSION',['REGISTER_ASSET','RECEIVE','INSTALL']);
  imply('REPLACE',['REGISTER_ASSET','RECEIVE','INSTALL']);
  imply('MAINTAIN',['REGISTER_ASSET','RECEIVE','INSTALL','INSPECT','TEST','COMMISSION','ENERGIZE']);
  imply('REPAIR',['REGISTER_ASSET','RECEIVE','INSTALL']);
  imply('ENERGIZE',['REGISTER_ASSET','RECEIVE','INSTALL','INSPECT','TEST','COMMISSION']);
  imply('COMMISSION',['REGISTER_ASSET','RECEIVE','INSTALL','INSPECT','TEST']);
  imply('INSPECT',['REGISTER_ASSET','RECEIVE','INSTALL']);
  imply('TEST',['REGISTER_ASSET','RECEIVE','INSTALL']);
  imply('INSTALL',['REGISTER_ASSET','RECEIVE']);
  imply('RECEIVE',['REGISTER_ASSET']);
  imply('SHIP',['REGISTER_ASSET']);
  imply('PROCURE',['REGISTER_ASSET']);
  imply('TRANSFER_CUSTODY',['REGISTER_ASSET']);
  return effective;
}

export function evaluateLifecycle(events:LifecycleEventSnapshot[]){
  const verified=new Set<LifecycleEventType>();
  const pending=new Set<LifecycleEventType>();
  for(const e of events){if(!isType(e.event_type))continue;if(e.status==='VERIFIED')verified.add(e.event_type);else if(e.status==='SUBMITTED')pending.add(e.event_type)}
  const effective=inferredFromLater(verified);
  const terminal=effective.has('DECOMMISSION');
  const allowed:LifecycleEventType[]=[];
  const blocked:Partial<Record<LifecycleEventType,string>>={};

  for(const type of lifecycleEventTypes){
    if(terminal){blocked[type]='Asset is decommissioned; lifecycle is closed.';continue}
    if(type==='REGISTER_ASSET'&&effective.has(type)){blocked[type]='Asset identity is already registered.';continue}
    if(pending.has(type)){blocked[type]=`${type} is already awaiting approval.`;continue}
    if(effective.has(type)&&!repeatable.has(type)){blocked[type]=`${type} is already verified for this asset.`;continue}
    if(type==='REGISTER_ASSET'){
      if(verified.size===0&&pending.size===0)allowed.push(type);else blocked[type]='REGISTER_ASSET must be the first lifecycle event.';
      continue;
    }
    if(!effective.has('REGISTER_ASSET')){blocked[type]='Verify REGISTER_ASSET first.';continue}
    if(preInstallOnly.has(type)&&effective.has('INSTALL')){blocked[type]=`${type} is a pre-installation event and cannot be added after installation is verified.`;continue}
    const groups=requirements[type]||[];
    const missing=groups.filter(group=>!group.some(req=>effective.has(req)));
    if(missing.length){blocked[type]=`Prerequisite required: ${missing.map(g=>g.join(' or ')).join(', ')}.`;continue}
    allowed.push(type);
  }

  const next:LifecycleEventType=terminal?'DECOMMISSION':
    !effective.has('REGISTER_ASSET')?'REGISTER_ASSET':
    !effective.has('RECEIVE')?'RECEIVE':
    !effective.has('INSTALL')?'INSTALL':
    !effective.has('INSPECT')?'INSPECT':
    !effective.has('TEST')?'TEST':
    !effective.has('COMMISSION')?'COMMISSION':
    !effective.has('ENERGIZE')?'ENERGIZE':'MAINTAIN';

  const recommendedNext=allowed.includes(next)?next:(allowed[0]||null);
  const inferred=[...effective].filter(x=>!verified.has(x));
  const phase=terminal?'DECOMMISSIONED':!effective.has('INSTALL')?'PRECONSTRUCTION':!effective.has('COMMISSION')?'INSTALLATION_QA':!effective.has('ENERGIZE')?'COMMISSIONING':'OPERATIONS';
  return{
    verified:[...verified],
    pending:[...pending],
    allowed,
    blocked,
    recommendedNext,
    phase,
    terminal,
    inferredPrerequisites:inferred,
    descriptions
  };
}

export function assertLifecycleTransition(events:LifecycleEventSnapshot[],requested:LifecycleEventType){
  const state=evaluateLifecycle(events);
  if(!state.allowed.includes(requested))throw Object.assign(new Error(state.blocked[requested]||`${requested} is not allowed in the asset's current lifecycle state.`),{status:409,workflowState:state});
  return state;
}

export const lifecycleDescriptions=descriptions;
