import { hash } from '../catalog/model';
import { readResponseWithLimit } from '../extract-security';
type Provider='ebay'|'walmart';
const cache=new Map<string,{value:string;expires:number;provider:Provider}>();const flights=new Map<string,Promise<string>>();
const generations:Record<Provider,number>={ebay:0,walmart:0};
export function invalidateMarketplaceToken(provider:Provider){
 generations[provider]++;for(const [key,value] of cache)if(value.provider===provider)cache.delete(key);
}
export function oauthConfigured(provider:Provider) {
  return provider==='ebay'?Boolean(process.env.EBAY_ACCESS_TOKEN || process.env.EBAY_CLIENT_ID && process.env.EBAY_CLIENT_SECRET && process.env.EBAY_REFRESH_TOKEN):Boolean(process.env.WALMART_ACCESS_TOKEN || process.env.WALMART_CLIENT_ID && process.env.WALMART_CLIENT_SECRET);
}
export async function marketplaceToken(provider:Provider) {
  const prefix=provider.toUpperCase();const id=process.env[`${prefix}_CLIENT_ID`],secret=process.env[`${prefix}_CLIENT_SECRET`],refresh=process.env[`${prefix}_REFRESH_TOKEN`];
  if(!id || !secret || provider==='ebay' && !refresh) {const token=process.env[`${prefix}_ACCESS_TOKEN`];if(!token)throw new Error(`Credenciais ${provider} não configuradas.`);return token;}
  const key=hash({provider,id,secret,refresh,scopes:provider==='ebay'?process.env.EBAY_OAUTH_SCOPES:undefined});const old=cache.get(key);if(old && old.expires>Date.now())return old.value;
  const flight=flights.get(key);if(flight)return flight;
  const generation=generations[provider],promise=mint();flights.set(key,promise);try{return await promise;}finally{flights.delete(key);}
  async function mint() {
    const form=provider==='ebay'?new URLSearchParams({grant_type:'refresh_token',refresh_token:refresh!,...(process.env.EBAY_OAUTH_SCOPES?{scope:process.env.EBAY_OAUTH_SCOPES}:{})}):new URLSearchParams({grant_type:'client_credentials'});
    const response=await fetch(provider==='ebay'?'https://api.ebay.com/identity/v1/oauth2/token':'https://marketplace.walmartapis.com/v3/token',{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{Authorization:`Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`,'content-type':'application/x-www-form-urlencoded',accept:'application/json',...(provider==='walmart'?{'WM_QOS.CORRELATION_ID':crypto.randomUUID(),'WM_SVC.NAME':'Walmart Marketplace'}:{})},body:form});
    if(!response.ok) {await response.body?.cancel();throw new Error(`OAuth ${provider} respondeu HTTP ${response.status}. Confira a aplicação e a autorização.`);}
    const data=JSON.parse(await readResponseWithLimit(response,32000));if(typeof data.access_token!=='string'||!Number.isFinite(Number(data.expires_in)))throw new Error(`OAuth ${provider} retornou token inválido.`);
    if(generations[provider]!==generation)throw new Error(`Autorização ${provider} mudou durante a renovação. Repita uma consulta antes de enviar.`);
    cache.set(key,{provider,value:data.access_token,expires:Date.now()+Math.max(0,Number(data.expires_in)-60)*1000});return data.access_token as string;
  }
}
