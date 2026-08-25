import {NextResponse} from 'next/server';
import {generateRegistrationOptions} from '@simplewebauthn/server';
import {requireSession} from '@/lib/server/auth';
import {activePasskeys,webauthnConfig} from '@/lib/server/webauthn';
import {query} from '@/lib/server/db';

export async function POST(req:Request){try{
 const s=await requireSession();const cfg=webauthnConfig(req);const existing=await activePasskeys(s.organizationId,s.userId);
 const options=await generateRegistrationOptions({rpName:cfg.rpName,rpID:cfg.rpID,userName:s.email,userDisplayName:s.email,attestationType:'none',authenticatorSelection:{residentKey:'preferred',userVerification:'required'},excludeCredentials:existing.map((x:any)=>({id:x.credential_id,transports:x.transports||[]}))});
 await query(`INSERT INTO webauthn_challenges(organization_id,user_id,purpose,challenge,expires_at) VALUES($1,$2,'REGISTER',$3,now()+interval '5 minutes')`,[s.organizationId,s.userId,options.challenge]);
 return NextResponse.json(options);
}catch(e:any){return NextResponse.json({error:e.message},{status:e.status||400})}}
