'use client';
import {useState} from 'react';
import {api} from '../../lib/catalog/client';
type Props={feed:any;canRecover:boolean;busy:boolean;run:(task:()=>Promise<void>)=>Promise<void>;reload:()=>Promise<void>};
export default function FeedRecovery({feed,canRecover,busy,run,reload}:Props) {
  const [id,setId]=useState(''),[evidence,setEvidence]=useState(''),[confirmed,setConfirmed]=useState(false);
  if(feed.feed_id||!['unknown','submitting'].includes(feed.status))return null;
  return <details className="mt-3"><summary>Recuperar ID após consulta no Seller Central</summary><p className="text-sm mt-2">Confira o documento {feed.document_id||'(não registrado)'}, o horário {feed.created_at}, os SKUs e o manifesto {feed.manifest_hash}. A API não comprova automaticamente essa correspondência; registre a evidência da conferência.</p><label className="field mt-3">Feed ID Amazon<input value={id} onChange={event=>{setId(event.target.value);setConfirmed(false);}}/></label><label className="field mt-3">Evidência da correspondência<textarea className="border rounded p-3" value={evidence} onChange={event=>{setEvidence(event.target.value);setConfirmed(false);}}/></label><label className="flex gap-2 mt-3"><input type="checkbox" checked={confirmed} onChange={event=>setConfirmed(event.target.checked)}/>Confirmei no Seller Central que este feed pertence exatamente a este documento e manifesto</label><button className="btn mt-3" disabled={busy||!canRecover||!confirmed||!id||evidence.trim().length<10} onClick={()=>run(async()=>{await api('/api/catalog/feed',{action:'recover-id',id:feed.id,feed_id:id,evidence,confirm:true});await reload();})}>Registrar correspondência e retomar consulta</button></details>;
}
