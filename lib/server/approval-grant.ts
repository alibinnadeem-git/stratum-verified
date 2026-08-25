import {SignJWT,jwtVerify} from 'jose';
function key(){const s=process.env.AUTH_SECRET;if(!s||s.length<32)throw new Error('AUTH_SECRET must be at least 32 characters');return new TextEncoder().encode(s)}
export type ApprovalGrant={userId:string;organizationId:string;lifecycleEventId:string;payloadHash:string;credentialDbId:string;credentialId:string};
export async function createApprovalGrant(g:ApprovalGrant){return new SignJWT(g).setProtectedHeader({alg:'HS256',typ:'SV-APPROVAL-GRANT'}).setIssuedAt().setExpirationTime('2m').setAudience('stratum-verified-approval').sign(key())}
export async function verifyApprovalGrant(token:string){const {payload}=await jwtVerify(token,key(),{audience:'stratum-verified-approval'});return payload as unknown as ApprovalGrant}
