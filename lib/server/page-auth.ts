import {redirect} from 'next/navigation';
import {requireSession,type SessionRole} from './auth';

export async function requirePageSession(nextPath:string,roles?:SessionRole[]){
  try{return await requireSession(roles)}catch(e:any){
    if(e?.status===401)redirect(`/login?next=${encodeURIComponent(nextPath)}`);
    throw e;
  }
}

export async function optionalPageSession(){
  try{return await requireSession()}catch{return null}
}
