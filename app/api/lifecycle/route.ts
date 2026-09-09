import {NextResponse} from 'next/server';
import {z} from 'zod';
import {requireSession} from '@/lib/server/auth';
import {query,tx} from '@/lib/server/db';
import {canonicalHash} from '@/lib/server/hash';
import {requireProjectAccess,requireProjectRole} from '@/lib/server/access';
import {appendAudit} from '@/lib/server/audit';
import {assertLifecycleTransition,evaluateLifecycle,lifecycleEventTypes} from '@/lib/workflow';

const Body=z.object({
  projectId:z.string().uuid(),
  assetId:z.string().uuid(),
  workOrderId:z.string().uuid().nullable().optional(),
  eventType:z.enum(lifecycleEventTypes),
  occurredAt:z.string().datetime().optional(),
  payload:z.record(z.string(),z.unknown()).default({})
});

export async function GET(req:Request){
  try{
    const s=await requireSession();
    const url=new URL(req.url);
    const assetId=z.string().uuid().parse(url.searchParams.get('assetId'));
    const asset=await query<{project_id:string}>(`SELECT project_id FROM assets WHERE id=$1 AND organization_id=$2 LIMIT 1`,[assetId,s.organizationId]);
    if(!asset.rows[0])return NextResponse.json({error:'Asset not found in the active organization.'},{status:404});
    await requireProjectAccess(s,asset.rows[0].project_id);
    const events=await query<{event_type:string;status:string;occurred_at:Date;id:string}>(`SELECT id::text,event_type::text,status::text,occurred_at FROM lifecycle_events WHERE organization_id=$1 AND asset_id=$2 ORDER BY occurred_at ASC,created_at ASC`,[s.organizationId,assetId]);
    return NextResponse.json({assetId,projectId:asset.rows[0].project_id,state:evaluateLifecycle(events.rows),events:events.rows});
  }catch(e:any){return NextResponse.json({error:e.message},{status:e.status||400})}
}

export async function POST(req:Request){
  try{
    const s=await requireSession();
    const b=Body.parse(await req.json());
    const effectiveRole=await requireProjectRole(s,b.projectId,['SUPER_ADMIN','ORG_ADMIN','PROJECT_MANAGER','TECHNICIAN','INSPECTOR']);
    const occurredAt=b.occurredAt||new Date().toISOString();
    const canonical={version:'stratum.verified.lifecycle.v1',organizationId:s.organizationId,projectId:b.projectId,assetId:b.assetId,eventType:b.eventType,occurredAt,payload:b.payload};
    const hash=canonicalHash(canonical);

    const out=await tx(async c=>{
      await c.query(`SELECT pg_advisory_xact_lock(hashtext($1))`,[`lifecycle-asset:${b.assetId}`]);
      const owned=await c.query(`SELECT a.id FROM assets a JOIN projects p ON p.id=a.project_id WHERE a.id=$1 AND a.organization_id=$2 AND p.id=$3 AND p.organization_id=$2 LIMIT 1`,[b.assetId,s.organizationId,b.projectId]);
      if(!owned.rows[0])throw Object.assign(new Error('Asset/project relationship is not available in the active organization.'),{status:403});
      if(b.workOrderId){
        const wo=await c.query(`SELECT id FROM work_orders WHERE id=$1 AND organization_id=$2 AND asset_id=$3 LIMIT 1`,[b.workOrderId,s.organizationId,b.assetId]);
        if(!wo.rows[0])throw Object.assign(new Error('Work order is not available for this asset in the active organization.'),{status:403});
      }
      const previous=await c.query<{event_type:string;status:string}>(`SELECT event_type::text,status::text FROM lifecycle_events WHERE organization_id=$1 AND asset_id=$2 ORDER BY occurred_at ASC,created_at ASC`,[s.organizationId,b.assetId]);
      assertLifecycleTransition(previous.rows,b.eventType);
      const r=await c.query(`INSERT INTO lifecycle_events(organization_id,project_id,asset_id,work_order_id,event_type,status,performed_by,occurred_at,canonical_payload,payload_sha256) VALUES($1,$2,$3,$4,$5,'SUBMITTED',$6,$7,$8,$9) RETURNING *`,[s.organizationId,b.projectId,b.assetId,b.workOrderId||null,b.eventType,s.userId,occurredAt,JSON.stringify(canonical),hash]);
      return r.rows[0];
    });

    await appendAudit({organizationId:s.organizationId,actorUserId:s.userId,action:'LIFECYCLE_SUBMIT',entityType:'LIFECYCLE_EVENT',entityId:out.id,metadata:{assetId:b.assetId,projectId:b.projectId,eventType:b.eventType,payloadHash:hash,effectiveRole}});
    return NextResponse.json({...out,canonicalHash:hash},{status:201});
  }catch(e:any){return NextResponse.json({error:e.message,workflowState:e.workflowState},{status:e.status||400})}
}
