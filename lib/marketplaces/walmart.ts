import {marketplaceToken,invalidateMarketplaceToken} from './oauth';
import {readResponseWithLimit} from '../extract-security';
import {assertRecoveryReleased} from '../operations/recovery';
import {withTrace,traceEvent} from '../operations/trace';
export class WalmartError extends Error{constructor(public status:number,public retryAfter=30){super(`Walmart respondeu HTTP ${status}.`);this.name='WalmartError';}}
export async function walmartRequest(path:string,method='GET',body?:unknown){
 const url=new URL(path,'https://marketplace.walmartapis.com');
 if(!path.startsWith('/v3/')||url.origin!=='https://marketplace.walmartapis.com'||url.username||url.password||url.hash)throw new Error('Caminho Walmart inválido.');
 const readOnlySpec=method==='POST'&&url.pathname==='/v3/items/spec';
 if(method!=='GET'&&!readOnlySpec)assertRecoveryReleased();
 return withTrace('walmart.request',{provider:'walmart'},async()=>{
  const response=await fetch(url,{method,redirect:'error',signal:AbortSignal.timeout(20000),headers:{'WM_SEC.ACCESS_TOKEN':await marketplaceToken('walmart'),'WM_QOS.CORRELATION_ID':crypto.randomUUID(),'WM_SVC.NAME':'Walmart Marketplace','WM_MARKET':'us',...(process.env.WALMART_API_GLOBAL_VERSION?{'WM_GLOBAL_VERSION':process.env.WALMART_API_GLOBAL_VERSION}:{}),...(process.env.WALMART_CONSUMER_CHANNEL_TYPE?{'WM_CONSUMER.CHANNEL.TYPE':process.env.WALMART_CONSUMER_CHANNEL_TYPE}:{}),accept:'application/json','content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
  traceEvent('provider.response',{http_status:response.status});
  if(!response.ok){if(response.status===401)invalidateMarketplaceToken('walmart');await response.body?.cancel();const retry=Number(response.headers.get('retry-after'));throw new WalmartError(response.status,Number.isFinite(retry)&&retry>0?retry:30);}
  if(response.status===204)return {};
  try{return JSON.parse(await readResponseWithLimit(response,5_000_000));}catch{throw new Error('Walmart retornou JSON inválido ou acima do limite.');}
 });
}
