import {query} from './db';

export function webauthnConfig(req:Request){
 const u=new URL(req.url);
 const rpID=process.env.WEBAUTHN_RP_ID||u.hostname;
 const origin=process.env.WEBAUTHN_ORIGIN||u.origin;
 const rpName=process.env.WEBAUTHN_RP_NAME||'STRATUM Verified';
 return{rpID,origin,rpName};
}

export async function activePasskeys(organizationId:string,userId:string){
 const r=await query<any>(`SELECT id,credential_id,public_key,counter,transports,device_type,backed_up,label,created_at,last_used_at FROM webauthn_credentials WHERE organization_id=$1 AND user_id=$2 AND revoked_at IS NULL ORDER BY created_at DESC`,[organizationId,userId]);
 return r.rows;
}
