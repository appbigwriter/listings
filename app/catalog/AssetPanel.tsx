'use client';
import {useState} from 'react';
import {api} from '../../lib/catalog/client';
type Props={sku:string;busy:boolean;run:(task:()=>Promise<void>)=>Promise<void>};
export default function AssetPanel({sku,busy,run}:Props) {
  const [file,setFile]=useState<File|null>(null),[purpose,setPurpose]=useState('technical'),[assets,setAssets]=useState<any[]>([]);
  const refresh=async()=>setAssets((await api(`/api/catalog/assets?sku=${encodeURIComponent(sku)}`)).data);
  const upload=async()=>{
    if(!file)throw new Error('Selecione um arquivo.');if(file.size>5000000)throw new Error('Arquivo acima de 5 MB.');
    const request=()=>fetch('/api/catalog/assets',{method:'POST',headers:{'content-type':file.type,'x-product-sku':encodeURIComponent(sku),'x-file-name':encodeURIComponent(file.name),'x-file-purpose':purpose},body:file});
    let response=await request();if(response.status===401){await api('/api/auth/session');response=await request();}
    const result=await response.json();if(!response.ok)throw new Error(result.error||'Upload não concluído.');
    setFile(null);await refresh();
  };
  return <section className="card mt-5"><h2 className="font-bold text-lg">Evidências e versões de arquivos</h2><p className="text-sm text-slate-500 mt-2">Fichas técnicas, certificados e imagens de referência em acesso privado. Cada envio cria uma nova versão. Use o ID e o hash na fonte da confirmação dos fatos.</p><div className="flex flex-wrap gap-3 mt-3"><select aria-label="Finalidade do arquivo" className="border rounded p-2" value={purpose} onChange={event=>setPurpose(event.target.value)}><option value="technical">Ficha técnica</option><option value="compliance">Certificado / conformidade</option><option value="image">Imagem de referência</option></select><input aria-label="Arquivo de evidência" type="file" accept="application/pdf,image/png,image/jpeg" onChange={event=>setFile(event.target.files?.[0]||null)}/><button className="btn" disabled={busy||!file} onClick={()=>run(upload)}>Enviar nova versão (até 5 MB)</button><button className="btn" disabled={busy} onClick={()=>run(refresh)}>Consultar versões</button></div>{assets.map(asset=><div key={asset.id} className="border-t pt-3 mt-3"><p>{asset.filename} · {asset.purpose} · {asset.status} · {asset.byte_size} bytes</p><p className="text-sm mt-1">Antimalware: {asset.scan_status} · {asset.scan_checked_at||'análise pendente'}</p><p className="text-xs break-all mt-1">{asset.created_at} · ID {asset.id} · SHA-256 {asset.sha256}</p>{asset.status==='ready'&&<a className="text-blue-600 inline-block mt-2" href={`/api/catalog/assets?id=${encodeURIComponent(asset.id)}`}>Baixar versão privada</a>}{asset.status==='pending'&&<button className="btn mt-2" disabled={busy} onClick={()=>run(async()=>{const response=await fetch(`/api/catalog/assets?action=recover&id=${encodeURIComponent(asset.id)}`,{method:'POST'});const result=await response.json();if(!response.ok)throw new Error(result.error);await refresh();})}>Verificar arquivo e recuperar versão</button>}</div>)}</section>;
}
