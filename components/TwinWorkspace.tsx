'use client';

import Link from 'next/link';
import {ChangeEvent,useEffect,useMemo,useRef,useState} from 'react';
import styles from './TwinWorkspace.module.css';

export type TwinAsset={
  id:string;
  asset_code:string;
  asset_type:string;
  name:string;
  model:string|null;
  serial_number:string|null;
  location_label:string|null;
  status:string;
  project_code:string;
  project_name:string;
  site_name:string;
  system_name:string|null;
  manufacturer_name:string|null;
  latest_event_type:string|null;
  ledger_network:string|null;
  ledger_tx_hash:string|null;
  ledger_block_height:string|null;
};

type DiscoveredObject={name:string;sourceId:string;assetId?:string|null};
type IngestResult={twin:{id:string;assetCode:string;name:string};assets:{id:string;assetCode:string;name:string;eventId:string;canonicalHash:string}[]};

const normalize=(s:string)=>s.toLowerCase().replace(/[^a-z0-9]/g,'');
const assetKeys=(a:TwinAsset)=>[a.asset_code,a.name,a.serial_number||'',a.model||''].map(normalize).filter(Boolean);

function matchAsset(name:string,assets:TwinAsset[]){
  const n=normalize(name);
  if(!n)return null;
  return assets.find(a=>assetKeys(a).some(k=>k.length>4&&(n.includes(k)||k.includes(n))))||null;
}

export default function TwinWorkspace({assets,referenceModelUrl}:{assets:TwinAsset[];referenceModelUrl?:string}){
  const mount=useRef<HTMLDivElement|null>(null);
  const [modelUrl,setModelUrl]=useState(referenceModelUrl||'');
  const [modelName,setModelName]=useState(referenceModelUrl?'STRATUM Reference Twin':'Live STRATUM Asset Twin');
  const [modelSha256,setModelSha256]=useState('');
  const [objects,setObjects]=useState<DiscoveredObject[]>([]);
  const [selected,setSelected]=useState<TwinAsset|null>(assets[0]||null);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [mode,setMode]=useState<'all'|'verified'|'pending'>('all');
  const fileUrl=useRef<string|null>(null);

  const verifiedCount=useMemo(()=>assets.filter(a=>!!a.ledger_block_height).length,[assets]);
  const boundCount=useMemo(()=>objects.filter(o=>o.assetId).length,[objects]);

  async function onFile(e:ChangeEvent<HTMLInputElement>){
    const file=e.target.files?.[0];
    if(!file)return;
    if(fileUrl.current)URL.revokeObjectURL(fileUrl.current);
    fileUrl.current=URL.createObjectURL(file);
    setModelUrl(fileUrl.current);
    setModelName(file.name);
    setMessage('Model loaded locally. Nothing leaves the browser until you choose Register discovered assets.');
    const digest=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());
    setModelSha256(Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join(''));
  }

  async function ingest(){
    const candidates=objects.filter(o=>!o.assetId);
    if(!candidates.length){setMessage('Every discovered object is already bound to a STRATUM Verified asset.');return;}
    setBusy(true);setMessage('Registering twin objects and creating hashed REGISTER_ASSET lifecycle records…');
    try{
      const r=await fetch('/api/twin/ingest',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({modelName,modelSha256:modelSha256||undefined,objects:candidates.map(o=>({name:o.name,sourceId:o.sourceId}))})});
      const j=await r.json();
      if(!r.ok)throw new Error(j.error||'Twin ingestion failed');
      const out=j as IngestResult;
      setMessage(`${out.assets.length} asset identities created under ${out.twin.assetCode}. Registration proofs are hashed and awaiting independent approval before Stratum Chain anchoring.`);
      setTimeout(()=>location.reload(),1200);
    }catch(e){setMessage(e instanceof Error?e.message:'Twin ingestion failed');}
    finally{setBusy(false);}
  }

  useEffect(()=>{
    let disposed=false;
    let cleanup=()=>{};
    (async()=>{
      if(!mount.current)return;
      const THREE=await import('three');
      const {OrbitControls}=await import('three/examples/jsm/controls/OrbitControls.js');
      const {GLTFLoader}=await import('three/examples/jsm/loaders/GLTFLoader.js');
      if(disposed||!mount.current)return;

      const host=mount.current;
      const scene=new THREE.Scene();
      scene.background=new THREE.Color(0x061019);
      scene.fog=new THREE.FogExp2(0x061019,.018);
      const camera=new THREE.PerspectiveCamera(42,host.clientWidth/Math.max(host.clientHeight,1),.1,2000);
      camera.position.set(14,11,18);
      const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});
      renderer.setPixelRatio(Math.min(devicePixelRatio,2));
      renderer.setSize(host.clientWidth,host.clientHeight);
      renderer.outputColorSpace=THREE.SRGBColorSpace;
      host.replaceChildren(renderer.domElement);
      const controls=new OrbitControls(camera,renderer.domElement);
      controls.enableDamping=true;controls.dampingFactor=.06;controls.target.set(0,1,0);
      scene.add(new THREE.HemisphereLight(0xbfe8ff,0x081018,2.2));
      const key=new THREE.DirectionalLight(0xffffff,3);key.position.set(8,14,10);scene.add(key);
      const rim=new THREE.PointLight(0x39db8a,28,40);rim.position.set(-8,5,-4);scene.add(rim);
      const grid=new THREE.GridHelper(42,42,0x23516e,0x102b3d);scene.add(grid);
      const root=new THREE.Group();scene.add(root);
      const clickable:any[]=[];
      const discovery:DiscoveredObject[]=[];
      const verifiedMat=()=>new THREE.MeshStandardMaterial({color:0x20c77a,metalness:.55,roughness:.3,emissive:0x062a1d,emissiveIntensity:.55});
      const pendingMat=()=>new THREE.MeshStandardMaterial({color:0x4b9bd1,metalness:.45,roughness:.4,emissive:0x081c2b,emissiveIntensity:.4});
      const unboundMat=()=>new THREE.MeshStandardMaterial({color:0xbd7334,metalness:.25,roughness:.55,emissive:0x321708,emissiveIntensity:.35});

      function frameObject(obj:any){
        const box=new THREE.Box3().setFromObject(obj);const size=box.getSize(new THREE.Vector3());const center=box.getCenter(new THREE.Vector3());
        obj.position.sub(center);const max=Math.max(size.x,size.y,size.z)||1;const scale=10/max;obj.scale.multiplyScalar(scale);controls.target.set(0,Math.max(1,size.y*scale*.15),0);camera.position.set(14,10,18);controls.update();
      }

      function buildAssetTwin(){
        assets.forEach((a,i)=>{
          if(mode==='verified'&&!a.ledger_block_height)return;
          if(mode==='pending'&&a.ledger_block_height)return;
          const geo=i%3===0?new THREE.BoxGeometry(2.1,3.4,1.5):i%3===1?new THREE.CylinderGeometry(1.05,1.05,3.2,24):new THREE.BoxGeometry(1.7,2.2,1.3);
          const mesh=new THREE.Mesh(geo,a.ledger_block_height?verifiedMat():pendingMat());
          const cols=Math.ceil(Math.sqrt(Math.max(assets.length,1)));const x=(i%cols)*4-(cols-1)*2;const z=Math.floor(i/cols)*4-2;
          mesh.position.set(x,geo.type.includes('Cylinder')?1.6:1.7,z);mesh.userData.assetId=a.id;mesh.userData.objectName=a.asset_code;mesh.castShadow=true;root.add(mesh);clickable.push(mesh);
          discovery.push({name:a.name,sourceId:a.asset_code,assetId:a.id});
          const ring=new THREE.Mesh(new THREE.TorusGeometry(1.35,.035,8,48),new THREE.MeshBasicMaterial({color:a.ledger_block_height?0x39db8a:0x5aa9ff}));ring.rotation.x=Math.PI/2;ring.position.set(x,.06,z);root.add(ring);
        });
      }

      if(modelUrl){
        new GLTFLoader().load(modelUrl,gltf=>{
          if(disposed)return;
          const model=gltf.scene;root.add(model);let index=0;
          model.traverse((node:any)=>{
            if(!node.isMesh)return;
            const objectName=node.name||node.parent?.name||`Twin object ${++index}`;
            const match=matchAsset(objectName,assets);
            node.userData.assetId=match?.id||null;node.userData.objectName=objectName;
            const original=Array.isArray(node.material)?node.material[0]:node.material;
            node.material=match?(match.ledger_block_height?verifiedMat():pendingMat()):unboundMat();
            if(original?.map)node.material.map=original.map;
            clickable.push(node);discovery.push({name:objectName,sourceId:node.uuid,assetId:match?.id||null});
          });
          setObjects(discovery);frameObject(model);
        },undefined,()=>{setMessage('The model could not be loaded. GLB is recommended; GLTF must contain embedded resources.');buildAssetTwin();setObjects(discovery);});
      }else{buildAssetTwin();setObjects(discovery);}

      const ray=new THREE.Raycaster();const pointer=new THREE.Vector2();
      const click=(ev:PointerEvent)=>{const rect=renderer.domElement.getBoundingClientRect();pointer.x=((ev.clientX-rect.left)/rect.width)*2-1;pointer.y=-((ev.clientY-rect.top)/rect.height)*2+1;ray.setFromCamera(pointer,camera);const hit=ray.intersectObjects(clickable,true)[0];if(!hit)return;const id=hit.object.userData.assetId;const a=assets.find(x=>x.id===id);if(a)setSelected(a);else setMessage(`${hit.object.userData.objectName||'This model object'} is not yet bound to a STRATUM Verified asset. Register it before it can be represented as verified.`);};
      renderer.domElement.addEventListener('pointerup',click);
      const resize=()=>{if(!host.clientWidth||!host.clientHeight)return;camera.aspect=host.clientWidth/host.clientHeight;camera.updateProjectionMatrix();renderer.setSize(host.clientWidth,host.clientHeight);};
      const ro=new ResizeObserver(resize);ro.observe(host);
      let frame=0;const animate=()=>{controls.update();root.rotation.y+=modelUrl?0:.0007;renderer.render(scene,camera);frame=requestAnimationFrame(animate)};animate();
      cleanup=()=>{cancelAnimationFrame(frame);ro.disconnect();renderer.domElement.removeEventListener('pointerup',click);controls.dispose();renderer.dispose();host.replaceChildren();};
    })();
    return()=>{disposed=true;cleanup();};
  },[assets,modelUrl,mode]);

  return <div className={styles.workspace}>
    <div className={styles.toolbar}>
      <div><span className={styles.kicker}>STRATUM TWIN ENGINE</span><strong>{modelName}</strong></div>
      <div className={styles.controls}>
        <button className={mode==='all'?styles.active:''} onClick={()=>setMode('all')}>All</button>
        <button className={mode==='verified'?styles.active:''} onClick={()=>setMode('verified')}>Verified</button>
        <button className={mode==='pending'?styles.active:''} onClick={()=>setMode('pending')}>Pending</button>
        <label className={styles.upload}>Submit design<input type="file" accept=".glb,.gltf,model/gltf-binary,model/gltf+json" onChange={onFile}/></label>
      </div>
    </div>

    <div className={styles.stageWrap}>
      <div className={styles.canvas} ref={mount}/>
      <div className={styles.legend}><span><i className={styles.green}/>Chain verified</span><span><i className={styles.blue}/>Registered / pending proof</span><span><i className={styles.orange}/>Unbound design object</span></div>
      <div className={styles.orbit}>Drag to orbit · scroll to zoom · click equipment to inspect</div>
    </div>

    <aside className={styles.panel}>
      <div className={styles.metrics}><div><b>{assets.length}</b><span>Asset identities</span></div><div><b>{verifiedCount}</b><span>Chain verified</span></div><div><b>{objects.length}</b><span>Twin objects</span></div><div><b>{boundCount}</b><span>Bound objects</span></div></div>
      {selected?<>
        <div className={styles.passportHead}><span>VERIFICATION PASSPORT</span><em className={selected.ledger_block_height?styles.seal:styles.pending}>{selected.ledger_block_height?'VERIFIED':'PENDING'}</em></div>
        <h2>{selected.name}</h2><p>{selected.asset_code} · {selected.asset_type}</p>
        <div className={styles.facts}><div><span>Site</span><b>{selected.site_name}</b></div><div><span>System</span><b>{selected.system_name||'Unassigned'}</b></div><div><span>Manufacturer</span><b>{selected.manufacturer_name||'Not recorded'}</b></div><div><span>Serial</span><b>{selected.serial_number||'Pending'}</b></div><div><span>Lifecycle</span><b>{selected.status}</b></div><div><span>Latest event</span><b>{selected.latest_event_type||'REGISTER_ASSET'}</b></div></div>
        <div className={styles.chainBox}><span>STRATUM CHAIN</span><strong>{selected.ledger_network||'stratum-devnet-1'}</strong><small>{selected.ledger_block_height?`Block #${selected.ledger_block_height}`:'Proof awaiting approval / anchoring'}</small><small>{selected.ledger_tx_hash||'Hashes only — private model and evidence remain off-chain'}</small></div>
        <div className={styles.actions}><Link href={`/assets/${selected.id}`}>Open asset passport</Link><Link href="/chain">Chain explorer</Link></div>
      </>:<div className={styles.empty}>Select an asset-backed object in the twin.</div>}

      {modelUrl&&<div className={styles.ingest}><span>DESIGN INGESTION</span><p>Unbound geometry is never shown as verified. Register discovered equipment to create durable STRATUM asset identities and hashed registration events.</p><button disabled={busy||objects.every(o=>o.assetId)} onClick={ingest}>{busy?'Registering…':`Register ${objects.filter(o=>!o.assetId).length} discovered assets`}</button></div>}
      {message&&<div className={styles.message}>{message}</div>}
    </aside>
  </div>;
}
