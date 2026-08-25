import {NextResponse} from 'next/server';
import {requireSession} from '@/lib/server/auth';
import {query} from '@/lib/server/db';
import {anchorAuditHead} from '@/lib/server/audit-anchor';
import {verifyAuditChain} from '@/lib/server/audit';
export async function GET(){try{const s=await requireSession(['SUPER_ADMIN','ORG_ADMIN']);const [integrity,a]=await Promise.all([verifyAuditChain(s.organizationId),query<any>(`SELECT * FROM audit_anchors WHERE organization_id=$1 ORDER BY created_at DESC LIMIT 20`,[s.organizationId])]);return NextResponse.json({integrity,anchors:a.rows})}catch(e:any){return NextResponse.json({error:e.message},{status:e.status||500})}}
export async function POST(){try{const s=await requireSession(['SUPER_ADMIN','ORG_ADMIN']);const out=await anchorAuditHead(s.organizationId,s.userId);return NextResponse.json(out)}catch(e:any){return NextResponse.json({error:e.message},{status:e.status||400})}}
