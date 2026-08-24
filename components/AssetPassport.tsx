import Link from 'next/link';
import AssetQR from './AssetQR';
import type {Asset} from '@/lib/data';
export default function AssetPassport({asset}:{asset:Asset}){return <div className="passport card">
 <div className="passport-head"><div><div className="eyebrow">STRATUM Verified Asset Passport</div><h2>{asset.name}</h2><div className="muted">{asset.manufacturer} · {asset.model}</div></div><div className="verify-seal">✓ VERIFIED</div></div>
 <div className="passport-grid"><div className="passport-facts"><div><span>Asset ID</span><strong>{asset.id}</strong></div><div><span>Serial Number</span><strong>{asset.serial}</strong></div><div><span>System</span><strong>{asset.system}</strong></div><div><span>Location</span><strong>{asset.location}</strong></div><div><span>Status</span><strong>{asset.status}</strong></div><div><span>Latest Block</span><strong>{asset.block||'Pending'}</strong></div></div><div className="qr-wrap"><AssetQR value={asset.qrToken}/><small>Scan asset passport</small></div></div>
 <div className="stage-row">{asset.stages.map((s,i)=><div className={`stage ${s.status}`} key={s.stage}><i>{s.status==='verified'?'✓':s.status==='pending'?'●':i+1}</i><span>{s.stage}</span></div>)}</div>
 <div className="passport-actions"><Link className="action" href={`/assets/${asset.id}`}>Open full passport</Link><Link className="ghost" href={`/verify?q=${asset.id}`}>Verify proof</Link></div>
 </div>}
