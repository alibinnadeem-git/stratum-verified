import {query} from './db';
import type {Session,SessionRole} from './auth';

export function isOrgWide(role:string){return role==='SUPER_ADMIN'||role==='ORG_ADMIN'}

export async function effectiveProjectRole(session:Session,projectId:string):Promise<SessionRole>{
  if(isOrgWide(session.role)){
    const r=await query(`SELECT 1 FROM projects WHERE id=$1 AND organization_id=$2`,[projectId,session.organizationId]);
    if(!r.rowCount)throw Object.assign(new Error('Project not found in this organization'),{status:404});
    return session.role;
  }
  const r=await query<{project_role:string|null}>(`SELECT pm.project_role FROM project_memberships pm JOIN projects p ON p.id=pm.project_id WHERE pm.project_id=$1 AND pm.user_id=$2 AND pm.organization_id=$3 AND p.organization_id=$3 LIMIT 1`,[projectId,session.userId,session.organizationId]);
  const row=r.rows[0];if(!row)throw Object.assign(new Error('You do not have access to this project'),{status:403});
  return (row.project_role||session.role) as SessionRole;
}

export async function requireProjectAccess(session:Session,projectId:string){await effectiveProjectRole(session,projectId)}

export async function requireProjectRole(session:Session,projectId:string,roles:SessionRole[]){
  const role=await effectiveProjectRole(session,projectId);
  if(!roles.includes(role))throw Object.assign(new Error(`Project role ${role} is not allowed for this action`),{status:403});
  return role;
}

export async function accessibleProjectIds(session:Session){
  if(isOrgWide(session.role)){
    const r=await query<{id:string}>(`SELECT id FROM projects WHERE organization_id=$1`,[session.organizationId]);
    return r.rows.map(x=>x.id);
  }
  const r=await query<{project_id:string}>(`SELECT project_id FROM project_memberships WHERE organization_id=$1 AND user_id=$2`,[session.organizationId,session.userId]);
  return r.rows.map(x=>x.project_id);
}
