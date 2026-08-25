import {NextResponse} from 'next/server';
import {z} from 'zod';
import {requireSession} from '@/lib/server/auth';
import {query,tx} from '@/lib/server/db';
import {appendAudit} from '@/lib/server/audit';

const Change=z.object({projectId:z.string().uuid(),userId:z.string().uuid(),assigned:z.boolean(),projectRole:z.string().max(80).optional()});

export async function GET(){try{const s=await requireSession(['SUPER_ADMIN','ORG_ADMIN']);const [p,u,a]=await Promise.all([
 query(`SELECT id,project_code,name,status FROM projects WHERE organization_id=$1 ORDER BY name`,[s.organizationId]),
 query(`SELECT u.id,u.email,u.display_name,m.role FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.organization_id=$1 AND u.is_active=true ORDER BY u.display_name,u.email`,[s.organizationId]),
 query(`SELECT pm.project_id,pm.user_id,pm.project_role,pm.created_at FROM project_memberships pm WHERE pm.organization_id=$1`,[s.organizationId])
]);return NextResponse.json({projects:p.rows,users:u.rows,assignments:a.rows})}catch(e:any){return NextResponse.json({error:e.message},{status:e.status||500})}}

export async function POST(req:Request){try{const s=await requireSession(['SUPER_ADMIN','ORG_ADMIN']);const b=Change.parse(await req.json());const valid=await query(`SELECT 1 FROM projects p JOIN memberships m ON m.organization_id=p.organization_id AND m.user_id=$2 WHERE p.id=$1 AND p.organization_id=$3`,[b.projectId,b.userId,s.organizationId]);if(!valid.rowCount)return NextResponse.json({error:'Project or user is outside this organization'},{status:404});await tx(async c=>{if(b.assigned)await c.query(`INSERT INTO project_memberships(organization_id,project_id,user_id,project_role,created_by) VALUES($1,$2,$3,$4,$5) ON CONFLICT(project_id,user_id) DO UPDATE SET project_role=EXCLUDED.project_role`,[s.organizationId,b.projectId,b.userId,b.projectRole||null,s.userId]);else await c.query(`DELETE FROM project_memberships WHERE organization_id=$1 AND project_id=$2 AND user_id=$3`,[s.organizationId,b.projectId,b.userId])});await appendAudit({organizationId:s.organizationId,actorUserId:s.userId,action:b.assigned?'PROJECT_ACCESS_GRANT':'PROJECT_ACCESS_REVOKE',entityType:'PROJECT_MEMBERSHIP',entityId:`${b.projectId}:${b.userId}`,metadata:{projectId:b.projectId,userId:b.userId,projectRole:b.projectRole||null}});return NextResponse.json({ok:true})}catch(e:any){return NextResponse.json({error:e.message},{status:e.status||400})}}
