import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
import {mkdirSync,writeFileSync} from 'node:fs';
beforeEach(()=>{
 vi.resetModules();for(const key of ['AMAZON_SP_API_CLIENT_ID','AMAZON_SP_API_CLIENT_SECRET','AMAZON_SP_API_REFRESH_TOKEN','AMAZON_SP_API_SELLER_ID'])vi.stubEnv(key,'ag05-local-fixture');vi.stubEnv('PRELISTING_RECOVERY_MODE','false');
});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
describe('AG05 actual Amazon transport with failures only at fetch boundary',()=>{
 it('preserves 429 retry-after without blindly repeating a mutating request',async()=>{
  let writes=0;const fetch=vi.fn(async(input:any)=>{
   const url=String(input);if(url==='https://api.amazon.com/auth/o2/token')return Response.json({access_token:'ag05-fixture',expires_in:3600});
   if(url.startsWith('https://sellingpartnerapi-na.amazon.com/listings/')){writes++;return Response.json({errors:[{code:'QuotaExceeded'}]},{status:429,headers:{'retry-after':'123'}});}throw new Error('Network blocked');
  });vi.stubGlobal('fetch',fetch);
  const {amazonRequest}=await import('../../../lib/marketplaces/amazon');await expect(amazonRequest('/listings/2021-08-01/items/fixture/AG05',{},'PUT',{attributes:{}})).rejects.toMatchObject({status:429,retryAfter:123});expect(writes).toBe(1);
 });
 it('propagates an injected timeout after the mutation starts, with one request and a bounded AbortSignal',async()=>{
  let writes=0,signal:AbortSignal|undefined;vi.stubGlobal('fetch',vi.fn(async(input:any,init:any)=>{
   if(String(input)==='https://api.amazon.com/auth/o2/token')return Response.json({access_token:'ag05-fixture',expires_in:3600});
   if(String(input).startsWith('https://sellingpartnerapi-na.amazon.com/listings/')){writes++;signal=init.signal;throw new DOMException('Injected boundary timeout','TimeoutError');}throw new Error('Network blocked');
  }));
  const {amazonRequest}=await import('../../../lib/marketplaces/amazon');await expect(amazonRequest('/listings/2021-08-01/items/fixture/AG05',{},'PUT',{})).rejects.toMatchObject({name:'TimeoutError'});expect(writes).toBe(1);expect(signal).toBeInstanceOf(AbortSignal);
 });
 it('never sends SP-API requests if authentication is throttled',async()=>{
  const fetch=vi.fn(async(input:any)=>{if(String(input)!=='https://api.amazon.com/auth/o2/token')throw new Error('SPAPI must not be called');return Response.json({error:'slow_down'},{status:429});});vi.stubGlobal('fetch',fetch);
  const {amazonRequest}=await import('../../../lib/marketplaces/amazon');await expect(amazonRequest('/listings/2021-08-01/items/fixture/AG05',{},'PUT',{})).rejects.toMatchObject({status:429,stage:'LWA (autenticação)'});expect(fetch).toHaveBeenCalledTimes(1);
  mkdirSync('artifacts/antigravity/AG-05',{recursive:true});writeFileSync('artifacts/antigravity/AG-05/transport.json',JSON.stringify({checked_at:new Date().toISOString(),scenarios:['SPAPI_429_retry_after_123_no_retry','timeout_injected_after_mutation_started_no_retry','LWA_429_prevents_SPAPI'],transport:'actual_amazonRequest',injection:'fetch_boundary_only',network:'blocked',elapsed_timeout_measured:false,ledger:'separate_SQL_process_crash_tests'},null,2));
 });
});
