import {NextResponse} from 'next/server';
import {requireSession} from '@/lib/server/auth';
import {query} from '@/lib/server/db';
export async function GET(){try{const s=await requireSession(['SUPER_ADMIN','ORG_ADMIN']);const r=await query(`SELECT se.id,se.event_type,se.created_at,se.metadata,u.email,u.display_name,actor.email actor_email FROM security_events se LEFT JOIN users u ON u.id=se.user_id LEFT JOIN users actor ON actor.id=se.actor_user_id WHERE se.organization_id=$1 ORDER BY se.created_at DESC LIMIT 150`,[s.organizationId]);return NextResponse.json({items:r.rows})}catch(e:any){return NextResponse.json({error:e.message},{status:e.status||500})}}
