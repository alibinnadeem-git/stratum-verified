import {cookies} from 'next/headers';
import {SignJWT,jwtVerify} from 'jose';
import {query} from './db';

export type SessionRole='SUPER_ADMIN'|'ORG_ADMIN'|'PROJECT_MANAGER'|'TECHNICIAN'|'CLIENT'|'INSPECTOR'|'VIEWER';
export type Session={userId:string;email:string;organizationId:string;role:SessionRole;sessionVersion:number};
const COOKIE='stratum_session';

function key(){const s=process.env.AUTH_SECRET;if(!s||s.length<32)throw new Error('AUTH_SECRET must be at least 32 characters');return new TextEncoder().encode(s)}

export async function createSession(session:Session){return new SignJWT(session).setProtectedHeader({alg:'HS256'}).setIssuedAt().setExpirationTime('12h').sign(key())}

export async function readSession():Promise<Session|null>{try{const token=(await cookies()).get(COOKIE)?.value;if(!token)return null;const {payload}=await jwtVerify(token,key());return payload as unknown as Session}catch{return null}}

export async function requireSession(roles?:SessionRole[]){
 const s=await readSession();if(!s)throw Object.assign(new Error('Unauthorized'),{status:401});
 const r=await query<{email:string;is_active:boolean;session_version:number;role:SessionRole}>(`SELECT u.email,u.is_active,u.session_version,m.role FROM users u JOIN memberships m ON m.user_id=u.id AND m.organization_id=$2 WHERE u.id=$1 LIMIT 1`,[s.userId,s.organizationId]);
 const live=r.rows[0];
 if(!live?.is_active||live.session_version!==s.sessionVersion)throw Object.assign(new Error('Session revoked'),{status:401});
 const current={...s,email:live.email,role:live.role};
 if(roles&&!roles.includes(current.role))throw Object.assign(new Error('Forbidden'),{status:403});
 return current;
}

export async function authenticate(email:string,password:string){
 const r=await query<{id:string;email:string;password_ok:boolean;organization_id:string;role:SessionRole;session_version:number;is_active:boolean}>(`SELECT u.id,u.email,(u.password_hash IS NOT NULL AND u.password_hash=crypt($2,u.password_hash)) password_ok,u.session_version,u.is_active,m.organization_id,m.role FROM users u JOIN memberships m ON m.user_id=u.id WHERE lower(u.email::text)=lower($1) ORDER BY CASE WHEN m.role='SUPER_ADMIN' THEN 0 ELSE 1 END LIMIT 1`,[email,password]);
 const x=r.rows[0];if(!x?.password_ok||!x.is_active)return null;
 await query(`UPDATE users SET last_login_at=now() WHERE id=$1`,[x.id]);
 await query(`INSERT INTO security_events(organization_id,user_id,actor_user_id,event_type,metadata) VALUES($1,$2,$2,'LOGIN_SUCCESS',$3::jsonb)`,[x.organization_id,x.id,JSON.stringify({email:x.email})]);
 return{userId:x.id,email:x.email,organizationId:x.organization_id,role:x.role,sessionVersion:x.session_version} satisfies Session;
}

export async function revokeAllSessions(userId:string,organizationId:string,actorUserId:string){
 await query(`UPDATE users SET session_version=session_version+1 WHERE id=$1`,[userId]);
 await query(`INSERT INTO security_events(organization_id,user_id,actor_user_id,event_type) VALUES($1,$2,$3,'SESSIONS_REVOKED')`,[organizationId,userId,actorUserId]);
}

export async function setSessionCookie(token:string){(await cookies()).set(COOKIE,token,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:60*60*12})}
export async function clearSessionCookie(){(await cookies()).set(COOKIE,'',{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:0})}
