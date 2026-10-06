import {describe,it,expect,vi} from 'vitest';
import {assertContract,contractChecksum,prepareTiktok,type TiktokContract,type TiktokIdentity} from '../../../lib/marketplaces/tiktok/contracts';
import {signTiktokRequest,assertTiktokTimestamp} from '../../../lib/marketplaces/tiktok/signing';
import {createTiktokTokenManager,type TiktokTokenRecord} from '../../../lib/marketplaces/tiktok/tokens';
import {createTiktokReader} from '../../../lib/marketplaces/tiktok/transport';
const now=Date.parse('2026-10-06T12:00:00Z'),identity:TiktokIdentity={app_key:'fixture-app',shop_id:'fixture-shop',shop_cipher:'fixture-cipher',region:'US'};
function contract(patch:Partial<TiktokContract>={}):TiktokContract{
 const result={format:1 as const,id:'synthetic-contract-not-official',api_version:'202309',identity,source_url:'https://partner.tiktokshop.com/docv2/page/api-versioning',retrieved_at:new Date(now).toISOString(),expires_at:new Date(now+86400000).toISOString(),operation:{path:'/authorization/202309/shops',method:'GET' as const,effect:'read' as const,required_scopes:['synthetic.scope'],shop_cipher_in_query:false},request_schema:{type:'object',additionalProperties:false},query_schema:{type:'object',properties:{page_token:{type:'string'}},additionalProperties:false},response_schema:{type:'object',required:['code','data'],properties:{code:{const:0},data:{type:'object',required:['synthetic'],properties:{synthetic:{const:true}},additionalProperties:false}},additionalProperties:false},checksum:'',...patch};
 result.checksum=contractChecksum(result);return result;
}
function token(patch:Partial<TiktokTokenRecord>={}):TiktokTokenRecord{return {version:'v1',identity,access_token:'synthetic-access-secret',refresh_token:'synthetic-refresh-secret',access_expires_at:now+3600000,refresh_expires_at:now+86400000,granted_scopes:['synthetic.scope'],revoked:false,...patch};}
function manager(record=token(),refresh?:Parameters<typeof createTiktokTokenManager>[2]){
 let stored=record;let lock=Promise.resolve();const store={load:vi.fn(async()=>stored),compareAndSet:vi.fn(async(version:string,next:TiktokTokenRecord)=>{if(stored.version!==version)return false;stored=next;return true;}),withRefreshLock:async<T>(run:()=>Promise<T>)=>{const previous=lock;let release!:()=>void;lock=new Promise<void>(resolve=>{release=resolve;});await previous;try{return await run();}finally{release();}}};
 return {store,tokens:createTiktokTokenManager(identity,store,refresh,()=>now),set:(next:TiktokTokenRecord)=>{stored=next;}};
}
describe('dormant TikTok Shop provisioning, entirely synthetic',()=>{
 it('signs exact path/sorted query and bytes, excluding access token/sign, using a fixed synthetic vector',()=>{
  const params={timestamp:'1791288000',app_key:'fixture-app'};
  expect(signTiktokRequest('/authorization/202309/shops',params,'fixture-secret')).toBe('da1203822ecd08db46d69e7133d9d064d90c5400935972eb1f8a0ecd3b30303f');
  expect(signTiktokRequest('/authorization/202309/shops',{...params,access_token:'never-signed',sign:'ignored'},'fixture-secret')).toBe(signTiktokRequest('/authorization/202309/shops',params,'fixture-secret'));
  expect(signTiktokRequest('/authorization/202309/shops',params,'fixture-secret','{"a":1}')).not.toBe(signTiktokRequest('/authorization/202309/shops',params,'fixture-secret','{ "a":1}'));
  expect(signTiktokRequest('/authorization/202309/shops',params,'fixture-secret','binary','multipart/form-data; boundary=synthetic')).toBe(signTiktokRequest('/authorization/202309/shops',params,'fixture-secret'));
 });
 it('rejects host/path injection and timestamp milliseconds/window errors',()=>{
  for(const path of ['//evil.invalid/authorization/202309/shops','https://evil.invalid/x','/authorization/202309/../shops','/authorization/202309/%2e%2e/shops','/authorization/202309/shops?token=secret'])expect(()=>signTiktokRequest(path,{},'s')).toThrow();
  const seconds=Math.floor(now/1000);assertTiktokTimestamp(seconds,seconds);
  for(const value of [now,seconds-301,seconds+31,seconds+0.5])expect(()=>assertTiktokTimestamp(value,seconds)).toThrow();
 });
 it('requires real imported contract identity/version/checksum/source/expiry, without choosing API defaults',()=>{
  expect(()=>assertContract(undefined,identity,now)).toThrow('TIKTOK_CONTRACT_REQUIRED');
  for(const bad of [contract({identity:{...identity,shop_id:'another-shop'}}),contract({api_version:'202308'}),contract({source_url:'https://evil.invalid/docv2/page/a'}),contract({expires_at:new Date(now-1).toISOString()}),{...contract(),checksum:'tampered'}])expect(()=>assertContract(bad,identity,now)).toThrow();
  assertContract(contract(),identity,now);
 });
 it('prepares immutable snapshot only from supplied schema payload, preserving disabled publication',()=>{
  const c=contract({operation:{...contract().operation,path:'/product/202309/products',method:'POST',effect:'write'},request_schema:{type:'object',properties:{title:{type:'string'},material:{const:'Synthetic Steel'}},required:['title','material'],additionalProperties:false}});
  const input={identity,contract:c,sku:'SYNTHETIC-ONLY',product_version:new Date(now).toISOString(),content_hash:'a'.repeat(64),payload:{title:'Synthetic sign',material:'Synthetic Steel'},query:{}};
  const result=prepareTiktok(input,now);expect(result).toMatchObject({publication_enabled:false,review_required:true,api_version:'202309'});
  input.payload.title='changed';expect(result.payload.title).toBe('Synthetic sign');
  expect(()=>prepareTiktok({...input,payload:{title:'Synthetic sign',material:'Invented'}},now)).toThrow();
  expect(()=>prepareTiktok({...input,content_hash:'not-a-version'},now)).toThrow();
 });
 it('singleflights normalized refresh with secretstore CAS and never guesses token wire lifetime',async()=>{
  const refresh=vi.fn(async()=>token({version:'v2',access_token:'refreshed-synthetic'}));
  const m=manager(token({access_expires_at:now+10}),refresh);
  const values=await Promise.all([m.tokens.get(['synthetic.scope']),m.tokens.get(['synthetic.scope'])]);
  expect(refresh).toHaveBeenCalledTimes(1);expect(m.store.compareAndSet).toHaveBeenCalledTimes(1);expect(values.map(value=>value.version)).toEqual(['v2','v2']);
  expect(JSON.stringify(values)).not.toContain('synthetic-refresh-secret');
 });
 it('blocks refresh without adapter, revoked/crossshop/expired tokens, missing scopes and CAS races',async()=>{
  await expect(manager(token({access_expires_at:now})).tokens.get([])).rejects.toThrow('TIKTOK_REFRESH_ADAPTER_REQUIRED');
  for(const record of [token({revoked:true}),token({identity:{...identity,shop_id:'foreign'}}),token({refresh_expires_at:now})])await expect(manager(record).tokens.get([])).rejects.toThrow('TIKTOK_TOKEN_INVALID');
  await expect(manager().tokens.get(['ungranted'])).rejects.toThrow('TIKTOK_SCOPE_DENIED');
  const m=manager(token({access_expires_at:now}),async()=>token({version:'v2'}));m.store.compareAndSet.mockResolvedValue(false);
  await expect(m.tokens.get([])).rejects.toThrow('TIKTOK_TOKEN_VERSION_CONFLICT');
 });
 it('has disabled default and refuses every write or reserved parameter before fetch',async()=>{
  const fetcher=vi.fn();const m=manager();
  const options={identity,app_secret:'synthetic-app-secret',tokens:m.tokens,fetch:fetcher,clock:()=>now};
  await expect(createTiktokReader(options).read(contract())).rejects.toThrow('TIKTOK_CONNECTOR_DISABLED');
  const reader=createTiktokReader({...options,allowReadOnly:true});
  await expect(reader.read(contract({operation:{...contract().operation,method:'POST'}}))).rejects.toThrow('TIKTOK_PUBLICATION_NOT_PROVISIONED');
  for(const query of [{access_token:'leak'},{shop_cipher:'foreign'},{app_key:'foreign'}] as Record<string,string>[])await expect(reader.read(contract(),query)).rejects.toThrow('TIKTOK_QUERY_RESERVED');
  expect(fetcher).not.toHaveBeenCalled();
 });
 it('requires refresh exclusivity across manager instances, then rereads the stored version',async()=>{
  const refresh=vi.fn(async()=>token({version:'v2'}));const m=manager(token({access_expires_at:now}),refresh);
  const second=createTiktokTokenManager(identity,m.store,refresh,()=>now);
  await Promise.all([m.tokens.get([]),second.get([])]);expect(refresh).toHaveBeenCalledTimes(1);
  const withoutLock={load:async()=>token({access_expires_at:now}),compareAndSet:async()=>true};
  await expect(createTiktokTokenManager(identity,withoutLock,refresh,()=>now).get([])).rejects.toThrow('TIKTOK_REFRESH_LOCK_REQUIRED');
 });
 it('does not expose secretstore exceptions or accidentally accept a foreign manager identity',async()=>{
  const broken={load:async()=>{throw new Error('SECRET_IN_STORE');},compareAndSet:async()=>false};
  await expect(createTiktokTokenManager(identity,broken,undefined,()=>now).get([])).rejects.toThrow('TIKTOK_SECRET_STORE_FAILED');
  const foreign={...identity,shop_id:'foreign'};const foreignRecord=token({identity:foreign});
  const tokens=createTiktokTokenManager(foreign,{load:async()=>foreignRecord,compareAndSet:async()=>false},undefined,()=>now);
  const fetcher=vi.fn();const reader=createTiktokReader({identity,app_secret:'synthetic',tokens,fetch:fetcher,clock:()=>now,allowReadOnly:true});
  await expect(reader.read(contract())).rejects.toThrow('TIKTOK_TOKEN_ACCOUNT_MISMATCH');expect(fetcher).not.toHaveBeenCalled();
 });
 it('constrains GET host/token header/no redirects, validates wire contract and sanitizes failures without retry',async()=>{
  const fetcher=vi.fn(async()=>new Response(JSON.stringify({code:0,data:{synthetic:true}}),{status:200}));
  const reader=createTiktokReader({identity,app_secret:'synthetic-app-secret',tokens:manager().tokens,fetch:fetcher,clock:()=>now,allowReadOnly:true});
  expect(await reader.read(contract())).toEqual({code:0,data:{synthetic:true}});
  const [url,init]=fetcher.mock.calls[0] as unknown as [URL,RequestInit];expect(url.origin).toBe('https://open-api.tiktokglobalshop.com');expect(url.searchParams.has('access_token')).toBe(false);expect(init.redirect).toBe('error');expect(new Headers(init.headers).get('x-tts-access-token')).toBe('synthetic-access-secret');
  fetcher.mockImplementation(async()=>{throw new Error('https://secret?refresh_token=LEAK');});
  await expect(reader.read(contract())).rejects.toThrow('TIKTOK_READ_TRANSPORT_FAILED');expect(fetcher).toHaveBeenCalledTimes(2);
  fetcher.mockImplementation(async()=>new Response(JSON.stringify({code:0,data:{unexpected:true}}),{status:200}));
  await expect(reader.read(contract())).rejects.toThrow('TIKTOK_SCHEMA_VALIDATION_FAILED');
  fetcher.mockImplementation(async()=>new Response('x'.repeat(2000001),{status:200}));
  await expect(reader.read(contract())).rejects.toThrow('TIKTOK_RESPONSE_TOO_LARGE');
 });
});
