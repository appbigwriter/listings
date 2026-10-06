import {buildWalmartPackage} from './walmart-package';
import {hash,type ProductInput} from '../catalog/model';
import {walmartRequest} from './walmart';
export function buildWalmartFeed(products:ProductInput[]){
 if(!products.length||products.length>5000||new Set(products.map(item=>item.sku)).size!==products.length)throw new Error('Seleção Walmart inválida.');
 const packages=products.map(buildWalmartPackage),header=packages[0].MPItemFeedHeader;
 if(packages.some(pack=>hash(pack.MPItemFeedHeader)!==hash(header)))throw new Error('Não combine headers/versões Get Spec diferentes.');
 const payload={MPItemFeedHeader:header,MPItem:packages.flatMap(pack=>pack.MPItem)};
 if(Buffer.byteLength(JSON.stringify(payload))>10_000_000)throw new Error('Feed Walmart acima do limite local de 10 MB.');
 return payload;
}
export function interpretWalmartFeedPage(value:any,feedId:string,skus:string[]){
 if(!value||value.feedId!==feedId||!['RECEIVED','INPROGRESS','PROCESSED','ERROR'].includes(value.feedStatus)||!Number.isSafeInteger(value.offset)||value.offset<0||!Number.isSafeInteger(value.limit)||value.limit<1||value.limit>1000||!Number.isSafeInteger(value.itemsReceived)||value.itemsReceived!==skus.length||!Array.isArray(value.itemDetails?.itemIngestionStatus))throw new Error('Resposta Walmart sem correspondência comprovada ao feed/manifesto.');
 const items=value.itemDetails.itemIngestionStatus,seen=new Set<string>();
 if(items.length>value.limit)throw new Error('Página Walmart excede o limite declarado.');
 const outcomes=items.map((item:any)=>{
  if(!item||!skus.includes(item.sku)||seen.has(item.sku)||!['SUCCESS','INPROGRESS','DATA_ERROR','SYSTEM_ERROR','TIMEOUT_ERROR'].includes(item.ingestionStatus))throw new Error('SKU/status Walmart inválido ou duplicado.');seen.add(item.sku);
  return {sku:item.sku,status:item.ingestionStatus==='SUCCESS'?'accepted':item.ingestionStatus==='INPROGRESS'?'processing':item.ingestionStatus==='DATA_ERROR'?'rejected':'unknown',publication_status:'not_verified',remote_item_id:typeof item.itemid==='string'?item.itemid:null,pending_review:item.ingestionStatus==='INPROGRESS'&&typeof item.pendingStatusDescription==='string',issues:item.ingestionErrors||null};
 });
 return {feed_status:value.feedStatus,outcomes,next_offset:value.offset+items.length<value.itemsReceived?value.offset+items.length:null,complete:value.offset===0&&seen.size===skus.length,requires_item_readback:true};
}
export async function getWalmartFeedPage(feedId:string,skus:string[],offset=0){
 if(!/^[A-Za-z0-9@_-]{1,200}$/.test(feedId)||!Number.isSafeInteger(offset)||offset<0||!skus.length||new Set(skus).size!==skus.length)throw new Error('Identidade/paginação de feed Walmart inválida.');
 return interpretWalmartFeedPage(await walmartRequest(`/v3/feeds/${encodeURIComponent(feedId)}?includeDetails=true&offset=${offset}&limit=50`),feedId,skus);
}
