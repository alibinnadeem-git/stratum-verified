import {NextResponse} from 'next/server';
import {requireSession} from '@/lib/server/auth';
import {query} from '@/lib/server/db';
import {verifyAuditChain} from '@/lib/server/audit';
export async function GET(){try{const s=await requireSession(['SUPER_ADMIN','ORG_ADMIN']);const [rows,integrity]=await Promise.all([query(`SELECT al.id,al.actor_user_id,al.action,al.entity_type,al.entity_id,al.metadata,al.created_at,al.prev_hash,al.event_hash,al.request_id,u.email actor_email,u.display_name actor_name FROM audit_log al LEFT JOIN users u ON u.id=al.actor_user_id WHERE al.organization_id=$1 ORDER BY al.id DESC LIMIT 500`,[s.organizationId]),verifyAuditChain(s.organizationId)]);return NextResponse.json({items:rows.rows,integrity})}catch(e:any){return NextResponse.json({error:e.message},{status:e.status||500})}}
