import {marketplaceToken,oauthConfigured,invalidateMarketplaceToken} from './oauth';
import {readResponseWithLimit} from '../extract-security';
import {traceEvent,withTrace} from '../operations/trace';
import {assertRecoveryReleased} from '../operations/recovery';
export class EbayError extends Error {constructor(public status:number,public codes:number[]=[],public retryAfter=30){super(`eBay respondeu HTTP ${status}${codes.length?' ('+codes.join(',')+')':''}.`);this.name='EbayError';}}
async function request(url:string,method:string,body?:unknown) {
 return withTrace('ebay.request',{provider:'ebay'},()=>requestStep(url,method,body));
}
async function requestStep(url:string,method:string,body?:unknown){
 if(method!=='GET')assertRecoveryReleased();
 const response=await fetch(url,{method,redirect:'error',signal:AbortSignal.timeout(15000),headers:{authorization:`Bearer ${await marketplaceToken('ebay')}`,'content-type':'application/json','content-language':'en-US','accept-language':'en-US'},body:body===undefined?undefined:JSON.stringify(body)});
 traceEvent('provider.response',{http_status:response.status});
 if(response.status===401)invalidateMarketplaceToken('ebay');
 if(response.status===204)return {};
 const text=await readResponseWithLimit(response,5_000_000);let data:any;
 try{data=text?JSON.parse(text):{};}catch{if(!response.ok)throw new EbayError(response.status);throw new Error('eBay retornou JSON inválido.');}
 if(!response.ok)throw new EbayError(response.status,(data.errors||[]).map((error:any)=>error.errorId).filter((id:unknown)=>Number.isSafeInteger(id)));
 return data;
}
export function ebayRequest(path:string,method:'GET'|'PUT'|'POST'='GET',body?:unknown) {
 const url=new URL(path,'https://api.ebay.com');
 if(!path.startsWith('/')||path.startsWith('//')||url.origin!=='https://api.ebay.com'||url.username||url.password||url.hash)throw new Error('Caminho eBay inválido.');
 return request(url.toString(),method,body);
}
export function ebayConfig() {
 const accountId=process.env.EBAY_ACCOUNT_ID?.trim()||'';
 return {accountId,marketplaceId:'EBAY_US',configured:oauthConfigured('ebay')&&Boolean(accountId)};
}
export async function assertEbayAccount() {
 const config=ebayConfig();if(!config.configured)throw new Error('Configure OAuth e o userId imutável da conta eBay.');
 const identity=await request('https://apiz.ebay.com/commerce/identity/v1/user/','GET');
 if(identity.userId!==config.accountId)throw new Error('O token eBay pertence a outra conta.');
 // Discard the optional business contact/address fields; only the immutable account ID is used.
 return {account_id:config.accountId,marketplace_id:config.marketplaceId};
}
