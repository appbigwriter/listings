'use client';
import {useEffect,useState} from 'react';
import {api} from '../../lib/catalog/client';
type Props={sku?:string;status:any;busy:boolean;run:(task:()=>Promise<void>)=>Promise<void>};
export default function OfferOperations({sku,status,busy,run}:Props){
 const [price,setPrice]=useState(true),[stock,setStock]=useState(false),[authority,setAuthority]=useState(false),[prepared,setPrepared]=useState<any>(null),[confirmed,setConfirmed]=useState(false),[result,setResult]=useState<any>(null);
 const [item,setItem]=useState<any>(null),[reason,setReason]=useState(''),[hours,setHours]=useState(24),[error,setError]=useState('');
 const selected=[...(price?['price']:[]),...(stock?['qty']:[])];
 const reset=()=>{setPrepared(null);setConfirmed(false);setResult(null);};
 useEffect(()=>{
  let current=true;reset();setItem(null);setAuthority(false);setReason('');setError('');
  if(sku)void api('/api/catalog/item?sku='+encodeURIComponent(sku)).then(data=>{if(current)setItem(data);}).catch(error=>{if(current)setError(error instanceof Error?error.message:'Falha ao carregar oferta.');});
  return()=>{current=false;};
 },[sku]);
 async function decision(enabled:boolean){
  await api('/api/catalog/offers',{action:'authority',sku,fields:selected,expected_version:item.updated_at,enabled,reason,expires_hours:hours,confirm:true});
  setItem(await api('/api/catalog/item?sku='+encodeURIComponent(sku!)));reset();setReason('');
 }
 const policy=item?.product?._catalog?.channels?.['amazon-us']?.offer_authority;
 return <section className="card mt-5"><h2 className="font-bold text-lg">Atualizar oferta existente na Amazon</h2><p className="text-sm text-slate-500 mt-2">Selecione um produto aprovado. O envio atualiza somente os valores escolhidos; estoque exige FBM.</p>
  {error&&<p role="alert" className="text-amber-700 mt-3">{error}</p>}
  <div className="flex flex-wrap gap-4 mt-3"><label><input type="checkbox" checked={price} onChange={event=>{setPrice(event.target.checked);reset();}}/> Preço</label><label><input type="checkbox" checked={stock} onChange={event=>{setStock(event.target.checked);reset();}}/> Estoque FBM</label></div>
  {item&&<div className="mt-3 border rounded p-3"><p>SKU {sku} · preço USD {String(item.product.price)} · estoque {String(item.product.qty)} · {String(item.product.fulfillment)}</p><p className="text-sm mt-2">Autoridade registrada: {policy?`${policy.status} · campos ${policy.fields.join(', ')} · validade ${policy.expires_at}`:'pendente'}. Mudança de conta, conteúdo ou valores exige nova decisão.</p>
   {status?.permissions?.publish&&<><label className="block mt-3">Fonte e motivo da decisão<input className="border rounded p-2 w-full" value={reason} onChange={event=>setReason(event.target.value)} placeholder="Documento de preços/estoque e motivo da habilitação ou pausa"/></label><label className="block mt-3">Validade (horas, até 168)<input type="number" min={1} max={168} className="border rounded p-2 ml-2 w-24" value={hours} onChange={event=>setHours(Number(event.target.value))}/></label></>}
  </div>}
  <label className="flex gap-2 mt-3"><input type="checkbox" checked={authority} onChange={event=>{setAuthority(event.target.checked);reset();}}/>Confirmo que o PreListing é a fonte autorizada dos valores selecionados</label>
  {status?.permissions?.publish&&<div className="flex flex-wrap gap-3"><button className="btn mt-3" disabled={busy||!item||!authority||!reason.trim()||!selected.length} onClick={()=>run(()=>decision(true))}>Registrar autoridade nesta versão</button><button className="btn mt-3" disabled={busy||!item||!reason.trim()||!selected.length} onClick={()=>run(()=>decision(false))}>Pausar autoridade de atualização</button></div>}
  <button className="btn mt-3" disabled={busy||!sku||!authority||!selected.length} onClick={()=>run(async()=>{setPrepared({...await api('/api/catalog/offers',{sku,fields:selected,authority:'prelisting'}),fields:selected});setConfirmed(false);setResult(null);})}>Preparar atualização de {sku||'um SKU selecionado'}</button>
  {prepared&&<div className="mt-3"><pre className="max-h-80 overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(prepared,null,2)}</pre><label className="flex gap-2 mt-3"><input type="checkbox" checked={confirmed} onChange={event=>setConfirmed(event.target.checked)}/>Revisei o SKU, a conta e os valores e confirmo esta atualização</label><button className="btn btn-primary mt-3" disabled={busy||!confirmed||!status?.publication||!status?.offer_publication||!status?.permissions?.publish} onClick={()=>run(async()=>{const outcome=await api('/api/catalog/offers',{action:'submit',sku:prepared.sku,fields:prepared.fields,authority:'prelisting',expected_hash:prepared.request_hash,confirm:true});reset();setResult(outcome);})}>Enviar atualização revisada</button>{!status?.offer_publication&&<p className="text-sm text-amber-800 mt-2">Atualizações de oferta ainda não foram habilitadas para o piloto.</p>}</div>}
  {result&&<p role="status" className="mt-3">Resultado: {result.status}. Consulte o listing para verificar preço e disponibilidade.</p>}
 </section>;
}
