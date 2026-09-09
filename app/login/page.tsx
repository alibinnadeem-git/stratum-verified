'use client';
import {FormEvent,useState} from 'react';
import {useRouter} from 'next/navigation';
export default function Login(){
 const r=useRouter();const [error,setError]=useState('');const [busy,setBusy]=useState(false);
 async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();setBusy(true);setError('');const f=new FormData(e.currentTarget);try{const res=await fetch('/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:f.get('email'),password:f.get('password')})});const j=await res.json();if(!res.ok)throw new Error(j.error||'Login failed');const next=new URLSearchParams(window.location.search).get('next')||'/';r.push(next.startsWith('/')&&!next.startsWith('//')?next:'/');r.refresh()}catch(e:any){setError(e.message);setBusy(false)}}
 return <main style={{maxWidth:520,margin:'10vh auto',padding:24}}><div className="card"><div className="eyebrow">STRATUM Verified</div><h1>Sign in</h1><p className="muted">Access is organization-scoped and role-controlled.</p><form onSubmit={submit} style={{display:'grid',gap:12}}><input name="email" type="email" required placeholder="Email" autoComplete="username"/><input name="password" type="password" minLength={8} required placeholder="Password" autoComplete="current-password"/><button className="action" disabled={busy}>{busy?'Signing in…':'Sign in'}</button>{error&&<div className="notice"><strong>Sign in failed</strong><span>{error}</span></div>}</form></div></main>;
}
