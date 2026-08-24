'use client';
import {useEffect,useState} from 'react';
import QRCode from 'qrcode';
export default function AssetQR({value,size=136}:{value:string;size?:number}){const [src,setSrc]=useState('');useEffect(()=>{QRCode.toDataURL(value,{width:size,margin:1,errorCorrectionLevel:'M'}).then(setSrc).catch(()=>setSrc(''))},[value,size]);return src?<img src={src} width={size} height={size} alt={`QR passport ${value}`} style={{width:size,height:size,borderRadius:10}}/>:<div style={{width:size,height:size,display:'grid',placeItems:'center'}} aria-label={`QR passport ${value}`}>Generating QR…</div>}
