import {NextResponse} from 'next/server';
import {verifyRegistrationResponse} from '@simplewebauthn/server';
import {requireSession} from '@/lib/server/auth';
import {webauthnConfig} from '@/lib/server/webauthn';
import {query,tx} from '@/lib/server/db';

export async function POST(req:Request){try{
 const s=await requireSession();const cfg=webauthnConfig(req);const body=await req.json();
 const ch=await query<any>(`SELECT * FROM webauthn_challenges WHERE organization_id=$1 AND user_id=$2 AND purpose='REGISTER' AND consumed_at IS NULL AND expires_at>now() ORDER BY created_at DESC LIMIT 1`,[s.organizationId,s.userId]);
 const challenge=ch.rows[0];if(!challenge)return NextResponse.json({error:'Registration challenge expired or missing'},{status:410});
 const verification=await verifyRegistrationResponse({response:body.response,expectedChallenge:challenge.challenge,expectedOrigin:cfg.origin,expectedRPID:cfg.rpID,requireUserVerification:true});
 if(!verification.verified||!verification.registrationInfo)return NextResponse.json({error:'Passkey registration could not be verified'},{status:422});
 const info:any=verification.registrationInfo;const credential=info.credential;
 const out=await tx(async c=>{const consumed=await c.query(`UPDATE webauthn_challenges SET consumed_at=now() WHERE id=$1 AND consumed_at IS NULL AND expires_at>now() RETURNING id`,[challenge.id]);if(!consumed.rows[0])throw Object.assign(new Error('Registration challenge has already been used or expired'),{status:409});const r=await c.query(`INSERT INTO webauthn_credentials(organization_id,user_id,credential_id,public_key,counter,transports,device_type,backed_up,label) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(credential_id) DO UPDATE SET revoked_at=NULL,revoked_by=NULL,last_used_at=now() RETURNING id,credential_id,label,device_type,backed_up,created_at`,[s.organizationId,s.userId,credential.id,Buffer.from(credential.publicKey),credential.counter||0,credential.transports||[],info.credentialDeviceType||null,!!info.credentialBackedUp,body.label||'Passkey']);await c.query(`INSERT INTO security_events(organization_id,user_id,actor_user_id,event_type,metadata) VALUES($1,$2,$2,'PASSKEY_REGISTERED',$3::jsonb)`,[s.organizationId,s.userId,JSON.stringify({credentialId:credential.id,label:body.label||'Passkey'})]);return r.rows[0]});
 return NextResponse.json({verified:true,credential:out});
}catch(e:any){return NextResponse.json({error:e.message},{status:e.status||400})}}
