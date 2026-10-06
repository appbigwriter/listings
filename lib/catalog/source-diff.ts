import {createCatalog,type ProductInput,type CatalogDocument} from './model';
export function stageSourceUpdate(current:ProductInput,source:CatalogDocument['source']):ProductInput {
 if(!source)throw new Error('Snapshot de origem ausente.');
 const next=structuredClone(current);next._catalog=createCatalog(next,next._catalog);next.source_update=structuredClone(source);next.human_reviewed=false;
 for(const listing of Object.values(next._catalog.channels))if(listing){delete listing.approval;delete listing.report;}
 return next;
}
export function sourceDiff(incoming:ProductInput[],existing:{sku:string;source?:{id:string;hash:string}}[],sourceId:string,complete:boolean) {
  const old=new Map(existing.filter(item=>item.source?.id===sourceId||sourceId==='loja-configurada'&&item.source?.id==='configured').map(item=>[item.sku,item]));
  const present=new Set(incoming.map(item=>String(item.sku)));
  return {complete_snapshot:complete,items:incoming.map(product=>({sku:String(product.sku),status:!old.has(String(product.sku))?'new':old.get(String(product.sku))!.source?.hash===product._catalog?.source?.hash?'unchanged':'changed'})),absent:complete?[...old.keys()].filter(sku=>!present.has(sku)):[],removal_action:'review_only'};
}
