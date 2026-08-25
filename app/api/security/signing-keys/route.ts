import {NextResponse} from 'next/server';
import {z} from 'zod';
import {requireSession} from '@/lib/server/auth';
import {canonicalHash} from '@/lib/server/hash';
import {query,tx} from '@/lib/server/db';

const Jwk=z.object({kty:z.literal('EC'),crv:z.literal('P-256'),x:z.string().min(20),y:z.string().min(20)}).passthrough();
const Register=z.object({label:z.string().min(1).max(120).default('Primary browser key'),publicKeyJwk:Jwk});
const Revoke=z.object({keyId:z.string().uuid()});

function fingerprint(jwk:Record<string,unknown>){return canonicalHash({kty:jwk.kty,crv:jwk.crv,x:jwk.x,y:jwk.y})}

export async function GET(){try{const s=await requireSession();const r=await query(`SELECT id,label,algorithm,fingerprint_sha256,created_at,last_used_at,revoked_at FROM user_signing_keys WHERE organization_id=$1 AND user_id=$2 ORDER BY created_at DESC`,[s.organizationId,s.userId]);return NextResponse.json({items:r.rows})}catch(e:any){return NextResponse.json({error:e.message},{status:e.status||500})}}

export async function POST(req:Request){try{const s=await requireSession();const b=Register.parse(await req.json());const fp=fingerprint(b.publicKeyJwk as any);const out=await tx(async c=>{const r=await c.query(`INSERT INTO user_signing_keys(organization_id,user_id,label,public_key_jwk,fingerprint_sha256) VALUES($1,$2,$3,$4::jsonb,$5) ON CONFLICT(user_id,fingerprint_sha256) DO UPDATE SET revoked_at=NULL,revoked_by=NULL,label=EXCLUDED.label RETURNING id,label,algorithm,fingerprint_sha256,created_at,last_used_at,revoked_at`,[s.organizationId,s.userId,b.label,JSON.stringify(b.publicKeyJwk),fp]);await c.query(`INSERT INTO security_events(organization_id,user_id,actor_user_id,event_type,metadata) VALUES($1,$2,$2,'SIGNING_KEY_REGISTERED',$3::jsonb)`,[s.organizationId,s.userId,JSON.stringify({fingerprint:fp,label:b.label})]);await c.query(`INSERT INTO audit_log(organization_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,'SIGNING_KEY_REGISTER','USER_SIGNING_KEY',$3,$4::jsonb)`,[s.organizationId,s.userId,r.rows[0].id,JSON.stringify({fingerprint:fp})]);return r.rows[0]});return NextResponse.json(out,{status:201})}catch(e:any){return NextResponse.json({error:e.message},{status:e.status||400})}}

export async function DELETE(req:Request){try{const s=await requireSession();const b=Revoke.parse(await req.json());const out=await tx(async c=>{const r=await c.query(`UPDATE user_signing_keys SET revoked_at=now(),revoked_by=$1 WHERE id=$2 AND organization_id=$3 AND user_id=$1 AND revoked_at IS NULL RETURNING id,fingerprint_sha256`,[s.userId,b.keyId,s.organizationId]);if(!r.rows[0])throw Object.assign(new Error('Active signing key not found'),{status:404});await c.query(`INSERT INTO security_events(organization_id,user_id,actor_user_id,event_type,metadata) VALUES($1,$2,$2,'SIGNING_KEY_REVOKED',$3::jsonb)`,[s.organizationId,s.userId,JSON.stringify({keyId:b.keyId,fingerprint:r.rows[0].fingerprint_sha256})]);return r.rows[0]});return NextResponse.json({ok:true,...out})}catch(e:any){return NextResponse.json({error:e.message},{status:e.status||400})}}
