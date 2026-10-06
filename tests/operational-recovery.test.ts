import {afterEach,describe,expect,it,vi} from 'vitest';
import type {AuthContext} from '../lib/auth';
import {recoveryMode,assertAmazonRecoveryRequest} from '../lib/operations/recovery';
import {executeAction} from '../lib/catalog/executor';
import {submitFeed} from '../lib/catalog/feed-executor';
import {submitOffer} from '../lib/catalog/offers';
import {submitEbay} from '../lib/catalog/ebay-executor';
import {enqueueJob,processJob} from '../lib/catalog/jobs';
import {amazonRequest} from '../lib/marketplaces/amazon';
import {ebayRequest} from '../lib/marketplaces/ebay';
import {uploadAmazonFeed} from '../lib/marketplaces/amazon-feeds';
const auth:AuthContext={userId:'owner',organizationId:'org',mode:'supabase-session',roles:['admin']};
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
describe('operator recovery hold',()=>{
 it('defaults to normal operation and holds on invalid nonempty configuration',()=>{
  for(const value of ['', 'false', 'FALSE']){vi.stubEnv('PRELISTING_RECOVERY_MODE',value);expect(recoveryMode()).toBe(false);}
  for(const value of ['true','TRUE','typo']){vi.stubEnv('PRELISTING_RECOVERY_MODE',value);expect(recoveryMode()).toBe(true);}
 });
 it('blocks every publication entry before database claims and every transport before network writes',async()=>{
  vi.stubEnv('PRELISTING_RECOVERY_MODE','true');
  const db:any={from:vi.fn(),rpc:vi.fn()},fetch=vi.fn();vi.stubGlobal('fetch',fetch);
  const attempts=[()=>executeAction(db,auth,'SKU','submit'),()=>submitFeed(db,auth,['SKU'],'hash',true),()=>submitOffer(db,auth,{}),()=>submitEbay(db,auth,{}),()=>enqueueJob(db,auth,'generate',{skus:['SKU']}),()=>amazonRequest('/feeds/2021-06-30/feeds',{},'POST',{}),()=>ebayRequest('/sell/inventory/v1/offer','POST',{}),()=>uploadAmazonFeed('https://example.com',{})];
  for(const attempt of attempts)await expect(attempt()).rejects.toMatchObject({status:503});
  expect(db.from).not.toHaveBeenCalled();expect(db.rpc).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();
 });
 it('permits read-only observations and exact Fees/preview operations, not arbitrary writes disguised as previews',()=>{
  vi.stubEnv('PRELISTING_RECOVERY_MODE','true');
  for(const [path,query,method] of [ ['/feeds/2021-06-30/feeds/123',{},'GET'],['/products/fees/v0/items/B012345678/feesEstimate',{},'POST'],['/listings/2021-08-01/items/seller/sku',{mode:'VALIDATION_PREVIEW'},'PUT']] as const)expect(()=>assertAmazonRecoveryRequest(path,query,method)).not.toThrow();
  for(const method of ['POST','PUT','PATCH','DELETE'])expect(()=>assertAmazonRecoveryRequest('/feeds/2021-06-30/feeds',{mode:'VALIDATION_PREVIEW'},method)).toThrow();
 });
 it('preserves pending preparation checkpoints without claiming leases or consuming retries',async()=>{
  vi.stubEnv('PRELISTING_RECOVERY_MODE','true');
  const job={id:'job',kind:'validate',status:'pending',cursor:1,attempts:0},update=vi.fn();
  const query:any={select:()=>query,eq:()=>query,maybeSingle:async()=>({data:job,error:null})};
  const db:any={from:()=>({...query,update})};
  expect(await processJob(db,auth,'job')).toEqual(job);expect(update).not.toHaveBeenCalled();
 });
});
