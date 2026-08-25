'use client';

type StoredSigner={userId:string;keyId:string;privateKey:CryptoKey;publicKey:CryptoKey;fingerprint:string;createdAt:string};
const DB='stratum-verified-identity';const STORE='signers';const VERSION=1;
function openDb(){return new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open(DB,VERSION);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(STORE))r.result.createObjectStore(STORE,{keyPath:'userId'})};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
async function getStored(userId:string){const db=await openDb();return new Promise<StoredSigner|undefined>((resolve,reject)=>{const tx=db.transaction(STORE,'readonly');const r=tx.objectStore(STORE).get(userId);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
async function putStored(x:StoredSigner){const db=await openDb();return new Promise<void>((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(x);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error)})}
export async function removeLocalSigner(userId:string){const db=await openDb();return new Promise<void>((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).delete(userId);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error)})}
function b64(buf:ArrayBuffer){let s='';for(const x of new Uint8Array(buf))s+=String.fromCharCode(x);return btoa(s)}
export async function getOrCreateSigner(userId:string){
 const current=await getStored(userId);if(current)return current;
 const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']) as CryptoKeyPair;
 const publicKeyJwk=await crypto.subtle.exportKey('jwk',pair.publicKey);
 const r=await fetch('/api/security/signing-keys',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({label:`Browser key · ${new Date().toLocaleDateString()}`,publicKeyJwk})});
 const j=await r.json();if(!r.ok)throw new Error(j.error||'Could not register signing identity');
 const stored:StoredSigner={userId,keyId:j.id,privateKey:pair.privateKey,publicKey:pair.publicKey,fingerprint:j.fingerprint_sha256,createdAt:new Date().toISOString()};await putStored(stored);return stored;
}
export async function signPayloadHash(userId:string,payloadHash:string){const signer=await getOrCreateSigner(userId);const sig=await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},signer.privateKey,new TextEncoder().encode(payloadHash));return{signingKeyId:signer.keyId,signature:b64(sig),fingerprint:signer.fingerprint}}
