import {assertBusinessQuery,assertContract,validateContractData,TIKTOK_API_ORIGIN,TiktokPreparationError,type TiktokContract,type TiktokIdentity} from './contracts';
import {assertTiktokTimestamp,signTiktokRequest} from './signing';
import type {createTiktokTokenManager} from './tokens';
import {hash} from '../../catalog/model';

export type TiktokReadOptions={allowReadOnly?:boolean;identity:TiktokIdentity;app_secret:string;tokens:ReturnType<typeof createTiktokTokenManager>;fetch?:typeof fetch;clock?:()=>number};
async function boundedJson(response:Response){
 if(!response.body)throw new TiktokPreparationError('TIKTOK_RESPONSE_INVALID',502);
 const reader=response.body.getReader();let size=0;const chunks:Uint8Array[]=[];
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>2000000)throw new TiktokPreparationError('TIKTOK_RESPONSE_TOO_LARGE',502);chunks.push(value);}}finally{await reader.cancel().catch(()=>undefined);reader.releaseLock();}
 try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new TiktokPreparationError('TIKTOK_RESPONSE_INVALID',502);}
}
/** Dormant server-only reader. All remote mutations remain blocked regardless of configuration. */
export function createTiktokReader(options:TiktokReadOptions){
 return {async read(contract:TiktokContract|undefined,query:Record<string,string>={}){
  if(options.allowReadOnly!==true)throw new TiktokPreparationError('TIKTOK_CONNECTOR_DISABLED',503);
  const now=(options.clock||Date.now)();assertContract(contract,options.identity,now);
  if(contract!.operation.method!=='GET'||contract!.operation.effect!=='read')throw new TiktokPreparationError('TIKTOK_PUBLICATION_NOT_PROVISIONED',503);
  assertBusinessQuery(query);
  validateContractData(contract!.query_schema,query);validateContractData(contract!.request_schema,{});
  const token=await options.tokens.get(contract!.operation.required_scopes);
  if(hash(token.identity)!==hash(options.identity))throw new TiktokPreparationError('TIKTOK_TOKEN_ACCOUNT_MISMATCH',401);
  const timestamp=Math.floor(now/1000);assertTiktokTimestamp(timestamp,Math.floor((options.clock||Date.now)()/1000));
  const parameters={...query,app_key:options.identity.app_key,timestamp:String(timestamp),...(contract!.operation.shop_cipher_in_query?{shop_cipher:options.identity.shop_cipher}:{})};
  const url=new URL(contract!.operation.path,TIKTOK_API_ORIGIN);
  for(const [key,value] of Object.entries(parameters))url.searchParams.set(key,value);
  url.searchParams.set('sign',signTiktokRequest(contract!.operation.path,parameters,options.app_secret));
  let response:Response;
  try{response=await (options.fetch||globalThis.fetch)(url,{method:'GET',headers:{'x-tts-access-token':token.access_token,accept:'application/json'},redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000)});}catch{throw new TiktokPreparationError('TIKTOK_READ_TRANSPORT_FAILED',503);}
  if(!response.ok){await response.body?.cancel().catch(()=>undefined);throw new TiktokPreparationError('TIKTOK_READ_HTTP_FAILED',response.status===429?429:502);}
  let data:unknown;try{data=await boundedJson(response);}catch(error){if(error instanceof TiktokPreparationError)throw error;throw new TiktokPreparationError('TIKTOK_RESPONSE_INVALID',502);}
  if(!data||typeof data!=='object'||Array.isArray(data)||(data as Record<string,unknown>).code!==0)throw new TiktokPreparationError('TIKTOK_REMOTE_RESPONSE_REJECTED',502);
  validateContractData(contract!.response_schema,data as Record<string,unknown>);
  return data;
 }};
}
