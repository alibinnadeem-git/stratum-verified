import {NextResponse} from 'next/server';
import {z} from 'zod';
import {requireSession} from '@/lib/server/auth';
import {query,tx} from '@/lib/server/db';
import {canonicalHash} from '@/lib/server/hash';

const Body=z.object({
  modelName:z.string().min(1).max(200),
  modelSha256:z.string().regex(/^[a-f0-9]{64}$/i).optional(),
  projectId:z.string().uuid().optional(),
  siteId:z.string().uuid().optional(),
  objects:z.array(z.object({name:z.string().min(1).max(200),sourceId:z.string().min(1).max(200)})).min(1).max(250)
});

function inferType(name:string){
  const n=name.toLowerCase();
  if(/transformer|xfmr|\btx\b/.test(n))return 'Transformer';
  if(/switchgear|switchboard|\bsg\b|\bmsb\b/.test(n))return 'Switchgear';
  if(/panel|panelboard|\bpnl\b/.test(n))return 'Panelboard';
  if(/charger|evse/.test(n))return 'EV Charging';
  if(/\bups\b/.test(n))return 'UPS';
  if(/\bats\b|transfer switch/.test(n))return 'Automatic Transfer Switch';
  if(/generator|genset/.test(n))return 'Generator';
  if(/busway|bus duct/.test(n))return 'Busway';
  if(/breaker|mccb|acb/.test(n))return 'Circuit Breaker';
  if(/battery|bess/.test(n))return 'Battery Energy Storage';
  if(/inverter/.test(n))return 'Inverter';
  return 'Digital Twin Asset';
}

export async function POST(req:Request){
  try{
    const s=await requireSession(['SUPER_ADMIN','ORG_ADMIN','PROJECT_MANAGER']);
    const b=Body.parse(await req.json());
    let projectId=b.projectId||null,siteId=b.siteId||null,systemId:string|null=null;
    if(!projectId||!siteId){
      const ctx=await query<{project_id:string;site_id:string;system_id:string|null}>(`SELECT project_id,site_id,system_id FROM assets WHERE organization_id=$1 ORDER BY created_at DESC LIMIT 1`,[s.organizationId]);
      const x=ctx.rows[0];
      if(!x)return NextResponse.json({error:'No project/site context exists yet. Register one asset or select a project and site before importing a twin.'},{status:409});
      projectId=projectId||x.project_id;siteId=siteId||x.site_id;systemId=x.system_id;
    }
    const now=new Date().toISOString();
    const seed=Date.now().toString(36).toUpperCase();
    const rootCode=`STR-TWN-${seed}`;
    const result=await tx(async c=>{
      const root=await c.query<{id:string;asset_code:string;name:string}>(`INSERT INTO assets(organization_id,project_id,site_id,system_id,asset_code,asset_type,name,model,location_label,specifications) VALUES($1,$2,$3,$4,$5,'DIGITAL_TWIN',$6,$7,'Digital Twin', $8) RETURNING id,asset_code,name`,[s.organizationId,projectId,siteId,systemId,rootCode,b.modelName,b.modelName,JSON.stringify({twin:true,sourceModel:b.modelName,sourceModelSha256:b.modelSha256||null,ingestedAt:now})]);
      const created:{id:string;assetCode:string;name:string;eventId:string;canonicalHash:string}[]=[];
      for(let i=0;i<b.objects.length;i++){
        const o=b.objects[i];
        const assetCode=`${rootCode}-${String(i+1).padStart(3,'0')}`;
        const type=inferType(o.name);
        const a=await c.query<{id:string}>(`INSERT INTO assets(organization_id,project_id,site_id,system_id,asset_code,asset_type,name,model,location_label,specifications) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'Digital Twin',$9) RETURNING id`,[s.organizationId,projectId,siteId,systemId,assetCode,type,o.name,b.modelName,JSON.stringify({twinRootAssetId:root.rows[0].id,twinRootAssetCode:rootCode,twinObjectId:o.sourceId,sourceObjectName:o.name,sourceModel:b.modelName,sourceModelSha256:b.modelSha256||null})]);
        const assetId=a.rows[0].id;
        const canonical={version:'stratum.verified.lifecycle.v1',organizationId:s.organizationId,projectId,assetId,eventType:'REGISTER_ASSET',occurredAt:now,payload:{source:'STRATUM_TWIN_ENGINE',twinRootAssetId:root.rows[0].id,twinRootAssetCode:rootCode,twinObjectId:o.sourceId,sourceObjectName:o.name,sourceModel:b.modelName,sourceModelSha256:b.modelSha256||null}};
        const hash=canonicalHash(canonical);
        const e=await c.query<{id:string}>(`INSERT INTO lifecycle_events(organization_id,project_id,asset_id,event_type,status,performed_by,occurred_at,canonical_payload,payload_sha256) VALUES($1,$2,$3,'REGISTER_ASSET','SUBMITTED',$4,$5,$6,$7) RETURNING id`,[s.organizationId,projectId,assetId,s.userId,now,JSON.stringify(canonical),hash]);
        created.push({id:assetId,assetCode,name:o.name,eventId:e.rows[0].id,canonicalHash:hash});
      }
      return {twin:{id:root.rows[0].id,assetCode:root.rows[0].asset_code,name:root.rows[0].name},assets:created};
    });
    return NextResponse.json(result,{status:201});
  }catch(e:any){return NextResponse.json({error:e.message},{status:e.status||400});}
}
