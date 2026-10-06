'use client';
import {api} from '../../lib/catalog/client';
type Props={feed:any;busy:boolean;canPrepare:boolean;run:(task:()=>Promise<void>)=>Promise<void>;prepared:(value:any)=>void};
export default function FeedRetry({feed,busy,canPrepare,run,prepared}:Props) {
 if(feed.status!=='failed'||feed.feed_id)return null;
 return <div className="mt-2"><p className="text-sm text-amber-800">Nova tentativa exige a mesma versão e comprovação de que createFeed não foi iniciado em nenhum SKU. O histórico anterior será preservado.</p><button className="btn mt-2" disabled={busy||!canPrepare} onClick={()=>run(async()=>{
  const skus=feed.manifest.map((item:any)=>item.sku),next=await api('/api/catalog/feed',{skus});
  if(next.manifest_hash!==feed.manifest_hash)throw new Error('Versão ou manifesto mudou. Esta falha não pode ser repetida com outro conteúdo.');
  prepared({...next,skus,retry_of:feed.id});
 })}>Preparar nova tentativa para revisão</button></div>;
}
