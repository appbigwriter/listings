import {marketplaceToken,invalidateMarketplaceToken} from './oauth';
import {walmartRequest,WalmartError} from './walmart';
import {readResponseWithLimit} from '../extract-security';
import {assertRecoveryReleased} from '../operations/recovery';
import {recoveryMode} from '../operations/recovery';
import {CatalogError} from '../catalog/repository';
import {withTrace,traceEvent} from '../operations/trace';

export function walmartAccountConfig(){
 const partnerId=process.env.WALMART_PARTNER_ID?.trim();
 if(!partnerId||!/^\d{1,64}$/.test(partnerId))throw new CatalogError('Configure o partnerId real da conta Walmart US.',503);
 const apiVersion=process.env.WALMART_API_GLOBAL_VERSION?.trim();if(!apiVersion||!/^\d+\.\d+$/.test(apiVersion))throw new CatalogError('Configure a versão global da API Walmart conforme o contrato da conta.',503);
 return {account_id:partnerId,api_version:apiVersion,marketplace_id:'US' as const,operation:'walmart_mp_item' as const};
}
async function verifiedProfile(expected:ReturnType<typeof walmartAccountConfig>){
 const config=walmartAccountConfig();
 if(config.account_id!==expected.account_id||config.api_version!==expected.api_version||expected.marketplace_id!=='US')throw new CatalogError('A conta/versão Walmart configurada mudou.',409);
 const profile=await walmartRequest('/v3/settings/partnerprofile');
 if(typeof profile?.partner?.partnerId!=='string'||profile.partner.partnerId!==config.account_id)throw new CatalogError('partnerId não corresponde à conta Walmart autorizada.',409);
 return {config,profile};
}
export async function assertWalmartIdentity(expected=walmartAccountConfig()){
 const {config}=await verifiedProfile(expected);return config;
}
export async function assertWalmartAccount(expected=walmartAccountConfig()){
 const {config,profile}=await verifiedProfile(expected);
 if(!Array.isArray(profile.configurations))throw new CatalogError('Configurações da conta Walmart não foram comprovadas.',422);
 const accounts=profile.configurations.filter((item:any)=>item?.configurationName==='ACCOUNT');
 const feeds=profile.configurations.filter((item:any)=>item?.configurationName==='FEED');
 if(accounts.length!==1||accounts[0].configuration?.status!=='ACTIVE'||feeds.length!==1||!Array.isArray(feeds[0].configuration?.values))throw new CatalogError('Conta Walmart ativa e configuração de feeds necessárias.',422);
 const supported=feeds[0].configuration.values.filter((item:any)=>item?.feedType==='MP_ITEM');
 if(supported.length!==1||!Array.isArray(supported[0].throttleConfigurations))throw new CatalogError('MP_ITEM não foi comprovado na conta Walmart.',422);
 const limits=supported[0].throttleConfigurations.filter((item:any)=>item?.type==='SELLER');
 const positiveInteger=(value:unknown)=>typeof value==='number'&&Number.isSafeInteger(value)&&value>0||typeof value==='string'&&/^\d+$/.test(value)&&Number.isSafeInteger(Number(value))&&Number(value)>0;
 if(limits.length!==1||!positiveInteger(limits[0].rate?.count)||!positiveInteger(limits[0].rate?.replenishTimeWindow?.value)||limits[0].rate.replenishTimeWindow.unitOfMeasurement!=='SECOND'||!positiveInteger(limits[0].fileSize?.value)||limits[0].fileSize.unitOfMeasurement!=='BYTES')throw new CatalogError('Limites MP_ITEM desta conta não foram comprovados.',422);
 return {...config,feed_limits:{max_submissions:Number(limits[0].rate.count),window_seconds:Number(limits[0].rate.replenishTimeWindow.value),max_bytes:Math.min(10_000_000,Number(limits[0].fileSize.value))}};
}
export function walmartPublicationEnabled(){return !recoveryMode()&&process.env.PRELISTING_ENABLE_PUBLICATION==='true'&&process.env.PRELISTING_ENABLE_WALMART_PUBLICATION==='true';}
export async function assertWalmartSkuAbsent(sku:string){
 try{await walmartRequest(`/v3/items/${encodeURIComponent(sku)}?productIdType=SKU`);}catch(error){if(error instanceof WalmartError&&error.status===404)return;throw error;}
 throw new CatalogError('SKU já existe na conta Walmart; o fluxo inicial não substitui um item existente.',409);
}
/** MP_ITEM seller-fulfilled setup only. FormData supplies the multipart boundary. No implicit retries. */
export async function postWalmartItemFeed(payload:Record<string,unknown>,expected:ReturnType<typeof walmartAccountConfig>){
 assertRecoveryReleased();
 if(!walmartPublicationEnabled())throw new CatalogError('Publicação Walmart desabilitada.',403);
 const verified=await assertWalmartAccount(expected);
 const json=JSON.stringify(payload);
 if(Buffer.byteLength(json)>verified.feed_limits.max_bytes)throw new CatalogError('Feed Walmart excede o limite da conta/10 MB local.',422);
 const form=new FormData();form.set('file',new Blob([json],{type:'application/json'}),'prelisting-mp-item.json');
 return withTrace('walmart.feed.submit',{provider:'walmart'},async()=>{
  let response:Response;try{response=await fetch('https://marketplace.walmartapis.com/v3/feeds?feedType=MP_ITEM',{method:'POST',redirect:'error',signal:AbortSignal.timeout(20000),headers:{'WM_SEC.ACCESS_TOKEN':await marketplaceToken('walmart'),'WM_QOS.CORRELATION_ID':crypto.randomUUID(),'WM_SVC.NAME':'Walmart Marketplace','WM_MARKET':'us','WM_GLOBAL_VERSION':verified.api_version,...(process.env.WALMART_CONSUMER_CHANNEL_TYPE?{'WM_CONSUMER.CHANNEL.TYPE':process.env.WALMART_CONSUMER_CHANNEL_TYPE}:{}),accept:'application/json'},body:form});}catch{throw new CatalogError('Resposta do envio Walmart não confirmada. Não repita o envio.',503);}
  traceEvent('provider.response',{http_status:response.status});
  if(!response.ok){if(response.status===401)invalidateMarketplaceToken('walmart');await response.body?.cancel();throw new WalmartError(response.status);}
  let value:unknown;try{value=JSON.parse(await readResponseWithLimit(response,5_000_000));}catch{throw new CatalogError('Walmart não confirmou uma resposta válida do feed. Não repita o envio.',503);}
  const feedId=value&&typeof value==='object'&&!Array.isArray(value)?(value as Record<string,unknown>).feedId:null;
  if(typeof feedId!=='string'||!/^[-A-Za-z0-9@_]{1,200}$/.test(feedId))throw new CatalogError('feedId Walmart não confirmado. Investigue sem reenviar.',503);
  return {feed_id:feedId,status:'accepted' as const,publication_status:'not_verified' as const};
 });
}
