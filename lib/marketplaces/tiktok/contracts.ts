import {hash} from '../../catalog/model';
import {validateSchema} from '../../catalog/schema';

export class TiktokPreparationError extends Error {
 constructor(public code:string,public status=422){super(code);this.name='TiktokPreparationError';}
}
export const TIKTOK_API_ORIGIN='https://open-api.tiktokglobalshop.com';
export type TiktokIdentity={app_key:string;shop_id:string;shop_cipher:string;region:'US'};
export type TiktokContract={
 format:1;id:string;api_version:string;identity:TiktokIdentity;source_url:string;retrieved_at:string;expires_at:string;
 operation:{path:string;method:'GET'|'POST'|'PUT'|'DELETE';effect:'read'|'write';required_scopes:string[];shop_cipher_in_query:boolean};
 request_schema:Record<string,unknown>;query_schema:Record<string,unknown>;response_schema:Record<string,unknown>;checksum:string;
};
const identifier=(value:unknown)=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,512}$/.test(value);
export function assertIdentity(identity:TiktokIdentity){
 if(!identity||identity.region!=='US'||!identifier(identity.app_key)||!identifier(identity.shop_id)||!identifier(identity.shop_cipher))throw new TiktokPreparationError('TIKTOK_IDENTITY_REQUIRED');
}
export function assertApiPath(path:string,version?:string){
 if(typeof path!=='string'||!/^\/[a-z_]+\/\d{6}\/[A-Za-z0-9_/-]+$/.test(path)||path.includes('//')||path.length>1024||version&&path.split('/')[2]!==version)throw new TiktokPreparationError('TIKTOK_PATH_INVALID');
}
export function contractChecksum(contract:Omit<TiktokContract,'checksum'>|TiktokContract){const {checksum,...content}=contract as TiktokContract;return hash(content);}
export function assertContract(contract:TiktokContract|undefined,identity:TiktokIdentity,now=Date.now()){
 assertIdentity(identity);
 if(!contract||contract.format!==1||!identifier(contract.id)||contractChecksum(contract)!==contract.checksum)throw new TiktokPreparationError('TIKTOK_CONTRACT_REQUIRED');
 assertIdentity(contract.identity);
 if(hash(contract.identity)!==hash(identity))throw new TiktokPreparationError('TIKTOK_CONTRACT_ACCOUNT_MISMATCH');
 if(!/^\d{4}(0[1-9]|1[0-2])$/.test(contract.api_version)||Number(contract.api_version)<202309)throw new TiktokPreparationError('TIKTOK_API_VERSION_REQUIRED');
 assertApiPath(contract.operation?.path,contract.api_version);
 const date=Date.parse(contract.retrieved_at),expires=Date.parse(contract.expires_at);
 if(!Number.isFinite(date)||!Number.isFinite(expires)||date>now+300000||expires<=now||expires<=date||expires-date>7*86400000)throw new TiktokPreparationError('TIKTOK_CONTRACT_EXPIRED');
 let source:URL;try{source=new URL(contract.source_url);}catch{throw new TiktokPreparationError('TIKTOK_CONTRACT_SOURCE_INVALID');}
 if(source.protocol!=='https:'||!['partner.tiktokshop.com','partner.us.tiktokshop.com'].includes(source.hostname)||source.username||source.password||source.port||!source.pathname.startsWith('/docv2/'))throw new TiktokPreparationError('TIKTOK_CONTRACT_SOURCE_INVALID');
 if(!['GET','POST','PUT','DELETE'].includes(contract.operation.method)||!['read','write'].includes(contract.operation.effect)||contract.operation.method==='GET'&&contract.operation.effect!=='read'||typeof contract.operation.shop_cipher_in_query!=='boolean'||!Array.isArray(contract.operation.required_scopes)||!contract.operation.required_scopes.length||contract.operation.required_scopes.some(scope=>typeof scope!=='string'||!scope.trim()))throw new TiktokPreparationError('TIKTOK_OPERATION_INVALID');
 for(const schema of [contract.request_schema,contract.query_schema,contract.response_schema])if(!schema||typeof schema!=='object'||Array.isArray(schema)||Buffer.byteLength(JSON.stringify(schema))>1000000)throw new TiktokPreparationError('TIKTOK_SCHEMA_REQUIRED');
}
export function validateContractData(schema:Record<string,unknown>,data:Record<string,unknown>){
 const issues=validateSchema(schema,data);
 if(issues.length)throw new TiktokPreparationError('TIKTOK_SCHEMA_VALIDATION_FAILED');
}
export function assertBusinessQuery(query:Record<string,string>){
 if(!query||typeof query!=='object'||Array.isArray(query)||Object.entries(query).some(([key,value])=>!/^[a-zA-Z0-9_]+$/.test(key)||typeof value!=='string'||['app_key','app_secret','timestamp','sign','access_token','refresh_token','shop_cipher'].includes(key)))throw new TiktokPreparationError('TIKTOK_QUERY_RESERVED');
}
/** Server-provided contract and explicit channel payload only. No inferred measurements/category mapping. */
export function prepareTiktok(input:{identity:TiktokIdentity;contract?:TiktokContract;sku:string;product_version:string;content_hash:string;payload:Record<string,unknown>;query:Record<string,string>},now=Date.now()){
 assertContract(input.contract,input.identity,now);
 const contract=input.contract!;
 if(!input.sku?.trim()||!Number.isFinite(Date.parse(input.product_version))||!/^[a-f0-9]{64}$/.test(input.content_hash))throw new TiktokPreparationError('TIKTOK_PRODUCT_VERSION_REQUIRED');
 assertBusinessQuery(input.query);validateContractData(contract.request_schema,input.payload);validateContractData(contract.query_schema,input.query);
 return {format:1,channel:'tiktok-us' as const,publication_enabled:false,contract_id:contract.id,contract_checksum:contract.checksum,api_version:contract.api_version,target:{shop_id:input.identity.shop_id,region:'US'},sku:input.sku,product_version:input.product_version,content_hash:input.content_hash,payload:structuredClone(input.payload),query:structuredClone(input.query),manifest_hash:hash({contract_checksum:contract.checksum,identity:input.identity,sku:input.sku,product_version:input.product_version,content_hash:input.content_hash,payload:input.payload,query:input.query}),review_required:true};
}
