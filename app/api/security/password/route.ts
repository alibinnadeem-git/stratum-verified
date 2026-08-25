import {NextResponse} from 'next/server';
import {z} from 'zod';
import {createSession,requireSession,revokeAllSessions,setSessionCookie} from '@/lib/server/auth';
import {query,tx} from '@/lib/server/db';

const Body=z.object({currentPassword:z.string().min(8),newPassword:z.string().min(12).max(200).refine(v=>/[A-Z]/.test(v)&&/[a-z]/.test(v)&&/[0-9]/.test(v),{message:'New password must include uppercase, lowercase and a number.'})});

export async function POST(req:Request){try{
 const s=await requireSession();const b=Body.parse(await req.json());
 const ok=await query<{password_ok:boolean}>(`SELECT (password_hash IS NOT NULL AND password_hash=crypt($2,password_hash)) password_ok FROM users WHERE id=$1`,[s.userId,b.currentPassword]);
 if(!ok.rows[0]?.password_ok)return NextResponse.json({error:'Current password is incorrect.'},{status:401});
 await tx(async c=>{await c.query(`UPDATE users SET password_hash=crypt($1,gen_salt('bf')),last_password_change_at=now(),session_version=session_version+1 WHERE id=$2`,[b.newPassword,s.userId]);await c.query(`INSERT INTO security_events(organization_id,user_id,actor_user_id,event_type) VALUES($1,$2,$2,'PASSWORD_CHANGED')`,[s.organizationId,s.userId]);await c.query(`INSERT INTO audit_log(organization_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,'PASSWORD_CHANGE','USER',$2,'{}'::jsonb)`,[s.organizationId,s.userId])});
 const updated=await query<{session_version:number}>(`SELECT session_version FROM users WHERE id=$1`,[s.userId]);
 await setSessionCookie(await createSession({...s,sessionVersion:updated.rows[0].session_version}));
 return NextResponse.json({ok:true,sessionsRevoked:true});
}catch(e:any){return NextResponse.json({error:e.message},{status:e.status||400})}}
