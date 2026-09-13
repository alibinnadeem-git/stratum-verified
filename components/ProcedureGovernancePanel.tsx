'use client';
import {useMemo,useState} from 'react';

type Procedure={id:string;projectId:string;procedureCode:string;procedureType:string;title:string;version:string;status:string;stepCount:number};
const input={width:'100%',padding:'10px 11px',borderRadius:10,border:'1px solid #21405a',background:'#081723',color:'#eef6ff'} as const;
async function json(url:string,options?:RequestInit){const r=await fetch(url,{...options,headers:{'content-type':'application/json',...(options?.headers||{})}});const x=await r.json();if(!r.ok)throw new Error(x.error||`Request failed (${r.status})`);return x}

export default function ProcedureGovernancePanel({procedures}:{procedures:Procedure[]}){
 const [procedureId,setProcedureId]=useState(procedures.find(p=>p.status!=='RETIRED')?.id||''),[busy,setBusy]=useState(''),[message,setMessage]=useState('');
 const selected=useMemo(()=>procedures.find(p=>p.id===procedureId)||null,[procedures,procedureId]);
 async function setStatus(status:'REVIEW'|'APPROVED'|'RETIRED'){
  if(!selected)return;setBusy(status);setMessage('');
  try{await json('/api/operational-intelligence',{method:'POST',body:JSON.stringify({kind:'procedure_status',projectId:selected.projectId,procedureId:selected.id,status})});setMessage(`${selected.procedureCode} moved to ${status}.`);window.location.reload()}catch(e:any){setMessage(e.message)}finally{setBusy('')}
 }
 return <section className="card"><div className="section-head"><div><div className="eyebrow">STRATUM Procedure Governance</div><h2>Review, approve and freeze executable procedures</h2><p className="muted">The sequence is DRAFT → REVIEW → APPROVED → RETIRED. Approval is restricted to project-management or organization-administration roles and must be performed by someone other than the procedure author. Once approved, procedure steps are immutable; changes require a new version.</p></div><span className="badge">INDEPENDENT APPROVAL</span></div>
  {message&&<div className="notice" style={{marginTop:12}}><strong>Governance</strong><span>{message}</span></div>}
  <select value={procedureId} onChange={e=>setProcedureId(e.target.value)} style={{...input,marginTop:12}}><option value="">Choose procedure</option>{procedures.map(p=><option key={p.id} value={p.id}>{p.procedureCode} · v{p.version} · {p.status} · {p.stepCount} step(s)</option>)}</select>
  {selected&&<div className="notice" style={{marginTop:10}}><strong>{selected.procedureCode} · {selected.procedureType} · {selected.status}</strong><span>{selected.title} · v{selected.version} · {selected.stepCount} machine-readable step(s)</span></div>}
  {selected&&<div className="button-row">{selected.status==='DRAFT'&&<button className="action secondary" disabled={!!busy} onClick={()=>setStatus('REVIEW')}>{busy==='REVIEW'?'Updating…':'Submit for Review'}</button>}{selected.status==='REVIEW'&&<button className="action" disabled={!!busy||selected.stepCount<1} onClick={()=>setStatus('APPROVED')}>{busy==='APPROVED'?'Approving…':'Independently Approve & Freeze'}</button>}{selected.status==='APPROVED'&&<button className="action secondary" disabled={!!busy} onClick={()=>setStatus('RETIRED')}>{busy==='RETIRED'?'Retiring…':'Retire Procedure'}</button>}{selected.status==='RETIRED'&&<span className="muted">Retired procedure is immutable. Create a new version to make changes.</span>}</div>}
 </section>
}
