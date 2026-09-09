import {Pool,PoolClient,QueryResultRow} from 'pg';
let pool:Pool|undefined;

function connectionString(){
 const raw=process.env.DATABASE_URL;
 if(!raw)throw new Error('DATABASE_URL is not configured');
 if(process.env.NODE_ENV!=='production')return raw;
 const url=new URL(raw);
 // pg-connection-string v2 currently aliases several SSL modes to verify-full and
 // warns that those semantics will change in v3. Pin the intended strong mode now.
 url.searchParams.set('sslmode','verify-full');
 return url.toString();
}

export function db(){
 if(!pool)pool=new Pool({connectionString:connectionString(),max:process.env.NODE_ENV==='production'?2:10});
 return pool;
}
export async function query<T extends QueryResultRow=QueryResultRow>(text:string,values:unknown[]=[]){return db().query<T>(text,values)}
export async function tx<T>(fn:(client:PoolClient)=>Promise<T>){const c=await db().connect();try{await c.query('BEGIN');const out=await fn(c);await c.query('COMMIT');return out}catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}}
