'use client';
import {useEffect,useState} from 'react';
import {api,download} from '../../lib/catalog/client';
import type {Channel} from '../../lib/catalog/channels';
export default function CoveragePanel({channel,busy,run}:{channel:Channel;busy:boolean;run:(task:()=>Promise<void>)=>Promise<void>}){
 const [report,setReport]=useState<any>(null);
 useEffect(()=>setReport(null),[channel]);
 async function collect(){
  const started_at=new Date().toISOString(),pages:any[]=[],items:any[]=[],seen=new Set<string>();let total:number|undefined,owner_id:string|undefined,organization_id:string|undefined;
  for(let offset=0;offset<=5000;offset+=100){
   const page=await api(`/api/catalog/coverage?channel=${channel}&offset=${offset}&limit=100`);
   if(owner_id!==undefined&&(page.owner_id!==owner_id||page.organization_id!==organization_id))throw new Error('A sessão mudou durante a consulta. Atualize o relatório.');owner_id=page.owner_id;organization_id=page.organization_id;
   if(total!==undefined&&page.total!==total)throw new Error('A população mudou durante a consulta. Atualize o relatório.');total=page.total;
   for(const item of page.data){if(seen.has(item.sku))throw new Error('A ordem do catálogo mudou durante a consulta. Atualize o relatório.');seen.add(item.sku);items.push(item);}
   pages.push({offset,checked_at:page.checked_at,page_hash:page.page_hash});
   if(items.length===total)break;if(!page.data.length)throw new Error('Consulta incompleta. Atualize o relatório.');
  }
  if(items.length!==total)throw new Error('Cobertura incompleta: limite da consulta atingido.');
  const preparation:Record<string,number>={},external:Record<string,number>={};for(const item of items){preparation[item.preparation]=(preparation[item.preparation]||0)+1;external[item.external]=(external[item.external]||0)+1;}
  setReport({version:1,channel,owner_id,organization_id,started_at,finished_at:new Date().toISOString(),scope:'current_owner_in_organization',population_basis:'owned_prelistings_only',source_store_population_reconciled:false,snapshot_consistency:'observations_per_page_not_atomic',total,preparation,external,pages,items});
 }
 return <section className="card mt-5"><h2 className="font-bold text-lg">Cobertura do catálogo por canal</h2><p className="text-sm text-slate-500 mt-2">Contabiliza preparações do seu escopo, incluindo arquivos, pendências e envios incertos. A origem da loja precisa ser reconciliada para confirmar a cobertura de toda a empresa.</p><div className="flex gap-3 mt-3"><button className="btn" disabled={busy} onClick={()=>run(collect)}>Conferir cobertura atual</button>{report&&<button className="btn" disabled={busy} onClick={()=>download(report,`coverage-${channel}.json`)}>Exportar relatório completo</button>}</div>{report&&<div className="mt-3"><p>{report.total} registros observados · {report.finished_at}</p><pre className="text-xs mt-3 whitespace-pre-wrap">{JSON.stringify({preparation:report.preparation,external:report.external},null,2)}</pre><p className="text-xs text-slate-500 mt-3">Consulta por páginas. As versões observadas constam no relatório; o resultado deve ser atualizado após alterações do catálogo.</p></div>}</section>;
}
