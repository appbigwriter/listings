import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
import {createCatalog,hash,contentHash,type ProductInput} from '../../../lib/catalog/model';
const mocks=vi.hoisted(()=>({load:vi.fn(),persist:vi.fn(),profile:vi.fn(),readiness:vi.fn(),page:vi.fn()}));
vi.mock('../../../lib/catalog/repository',async()=>{const actual=await vi.importActual<any>('../../../lib/catalog/repository');return {...actual,loadProduct:mocks.load,persistProduct:mocks.persist};});
vi.mock('../../../lib/catalog/readiness',()=>({evaluateReadiness:mocks.readiness}));
vi.mock('../../../lib/marketplaces/walmart',()=>({walmartRequest:mocks.profile,WalmartError:class extends Error{constructor(public status:number){super('Walmart HTTP '+status);}}}));
vi.mock('../../../lib/marketplaces/walmart-feed',()=>({getWalmartFeedPage:mocks.page}));
vi.mock('../../../lib/marketplaces/oauth',()=>({marketplaceToken:async()=> 'synthetic-token',invalidateMarketplaceToken:vi.fn()}));
import {assertWalmartAccount,postWalmartItemFeed,walmartAccountConfig} from '../../../lib/marketplaces/walmart-submission';
import {prepareWalmart,submitWalmart,monitorWalmart} from '../../../lib/catalog/walmart-executor';
import {WalmartError} from '../../../lib/marketplaces/walmart';
import type {AuthContext} from '../../../lib/auth';
const auth:AuthContext={userId:'00000000-0000-4000-8000-000000000001',organizationId:'00000000-0000-4000-8000-000000000002',mode:'supabase-session',roles:['admin']};
function profile(){return {partner:{partnerId:'100009',partnerName:'SYNTHETIC_PRIVATE_NAME',businessRegNumber:'SYNTHETIC_TAX'},configurations:[{configurationName:'ACCOUNT',configuration:{status:'ACTIVE'}},{configurationName:'FEED',configuration:{values:[{feedType:'MP_ITEM',throttleConfigurations:[{type:'SELLER',rate:{count:6,replenishTimeWindow:{value:'3600',unitOfMeasurement:'SECOND'}},fileSize:{value:26214400,unitOfMeasurement:'BYTES'}}]}]}}]};}
function product():ProductInput{
 const value:ProductInput={sku:'SYNTHETIC-WM',title:'Synthetic sign',price:20,currency:'USD',gtin:'00012345678905',_catalog:createCatalog({sku:'SYNTHETIC-WM'})};
 value._catalog!.facts.gtin={value:value.gtin,status:'confirmed',source:'synthetic fixture only',observed_at:new Date().toISOString()};
 const schema={type:'object',required:['MPItemFeedHeader','MPItem'],properties:{MPItemFeedHeader:{type:'object'},MPItem:{type:'array',minItems:1,maxItems:1,items:{type:'object',required:['Orderable','Visible']}}}};
 value._catalog!.channels['walmart-us']={category:'SyntheticSigns',product_type:'SyntheticSigns',schema:{channel:'walmart-us',category:'SyntheticSigns',product_type:'SyntheticSigns',schema,version:'synthetic-spec',checksum:hash(schema),fetched_at:new Date().toISOString()},attributes:{MPItemFeedHeader:{feedType:'MP_ITEM',sellingChannel:'marketplace',processMode:'REPLACE',version:'synthetic-spec'},Orderable:{sku:value.sku,specProductType:'SyntheticSigns',price:20,productIdentifiers:{productIdType:'GTIN',productId:value.gtin}},Visible:{SyntheticSigns:{productName:'Synthetic sign'}}}};
 return value;
}
function database(){
 let record:any;const operations:any[]=[];let failAccepted=false;
 const db={rpc:vi.fn(async(_name:string,args:any)=>{operations.push({rpc:args});record={id:'00000000-0000-4000-8000-000000000003',sku:args.p_sku,owner_id:args.p_owner,organization_id:args.p_organization,channel:args.p_channel,request_hash:args.p_hash,request_payload:args.p_payload,target:args.p_target,status:'submitting',response:{},created_at:new Date(Date.now()-300000).toISOString(),updated_at:'2026-10-06T12:00:00Z'};return {data:record.id,error:null};}),from:vi.fn(()=>{
  let patch:any,filters:Record<string,any>={};const query={select(){return this;},update(value:any){patch=value;return this;},eq(key:string,value:any){filters[key]=value;return this;},order(){return this;},limit(){return this;},async maybeSingle(){operations.push({filters,patch});if(patch?.status==='accepted'&&failAccepted){failAccepted=false;return {data:null,error:{code:'synthetic_checkpoint_failure'}};}if(!record||Object.entries(filters).some(([key,value])=>record[key]!==value))return {data:null,error:null};if(patch)record={...record,...patch};return {data:structuredClone(record),error:null};},then(resolve:any){return this.maybeSingle().then(resolve);}};return query;
 })};
 return {db:db as never,operations,get:()=>record,set:(value:any)=>{record=value;},failAccepted:()=>{failAccepted=true;}};
}
beforeEach(()=>{
 vi.stubEnv('WALMART_PARTNER_ID','100009');vi.stubEnv('WALMART_API_GLOBAL_VERSION','3.1');vi.stubEnv('PRELISTING_ENABLE_PUBLICATION','true');vi.stubEnv('PRELISTING_ENABLE_WALMART_PUBLICATION','true');vi.stubEnv('PRELISTING_RECOVERY_MODE','false');
 mocks.profile.mockImplementation(async(path:string)=>{if(path.includes('/v3/items/'))throw new WalmartError(404);return profile();});mocks.readiness.mockReturnValue({ready:true,issues:[]});const value=product();mocks.load.mockResolvedValue({product:value,row:{sku:value.sku,id:'synthetic-row',updated_at:'2026-10-06T12:00:00Z'}});mocks.persist.mockResolvedValue({sku:value.sku});
});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();vi.clearAllMocks();});
describe('Walmart single-SKU feed pipeline, synthetic contracts only',()=>{
 it('sanitizes account receipt and rejects foreign/inactive/unsupported/unproven limits',async()=>{
  expect(await assertWalmartAccount()).toEqual({account_id:'100009',api_version:'3.1',marketplace_id:'US',operation:'walmart_mp_item',feed_limits:{max_submissions:6,window_seconds:3600,max_bytes:10000000}});
  for(const change of [(p:any)=>{p.partner.partnerId='foreign';},(p:any)=>{p.configurations[0].configuration.status='SUSPENDED';},(p:any)=>{p.configurations[1].configuration.values[0].feedType='inventory';},(p:any)=>{p.configurations[1].configuration.values[0].throttleConfigurations[0].fileSize.unitOfMeasurement='UNKNOWN';}]){const p=profile();change(p);mocks.profile.mockResolvedValue(p);await expect(assertWalmartAccount()).rejects.toThrow();}
 });
 it('transmits exact multipart JSON file with native boundary, fixed URL and no token query',async()=>{
  const fetcher=vi.fn(async()=>new Response(JSON.stringify({feedId:'SYNTHETIC@US'}),{status:200}));vi.stubGlobal('fetch',fetcher);
  const payload={MPItemFeedHeader:{synthetic:true},MPItem:[]};expect(await postWalmartItemFeed(payload,walmartAccountConfig())).toMatchObject({status:'accepted',publication_status:'not_verified'});
  const [url,init]=fetcher.mock.calls[0] as unknown as [string,RequestInit];expect(url).toBe('https://marketplace.walmartapis.com/v3/feeds?feedType=MP_ITEM');expect(init.redirect).toBe('error');expect(new Headers(init.headers).has('content-type')).toBe(false);expect(new Headers(init.headers).get('WM_SEC.ACCESS_TOKEN')).toBe('synthetic-token');
  expect(await ((init.body as FormData).get('file') as File).text()).toBe(JSON.stringify(payload));
 });
 it('checks permission/flags/recovery before RPC or transport and refuses stale manifest',async()=>{
  const db=database(),fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
  await expect(submitWalmart(db.db,{...auth,roles:['operator']},{sku:'SYNTHETIC-WM',confirm:true})).rejects.toMatchObject({status:403});
  vi.stubEnv('PRELISTING_RECOVERY_MODE','true');await expect(submitWalmart(db.db,auth,{sku:'SYNTHETIC-WM',confirm:true})).rejects.toMatchObject({status:503});
  vi.stubEnv('PRELISTING_RECOVERY_MODE','false');await expect(submitWalmart(db.db,auth,{sku:'SYNTHETIC-WM',confirm:true,expected_hash:'stale'})).rejects.toMatchObject({status:409});
  expect((db.db as any).rpc).not.toHaveBeenCalled();expect(fetcher).not.toHaveBeenCalled();
 });
 it('reserves exact version/account before one POST; timeout preserves unknown without replay',async()=>{
  const db=database();const prepared=await prepareWalmart(db.db,auth,'SYNTHETIC-WM');const fetcher=vi.fn(async()=>{throw new Error('synthetic-secret-message');});vi.stubGlobal('fetch',fetcher);
  await expect(submitWalmart(db.db,auth,{sku:prepared.sku,expected_hash:prepared.request_hash,confirm:true})).rejects.toThrow('Investigue sem reenviar');
  expect(fetcher).toHaveBeenCalledTimes(1);expect(db.get()).toMatchObject({status:'unknown',response:{stage:'feed_request_started',feed_id:null}});
  const rpc=db.operations.find(item=>item.rpc).rpc;expect(rpc).toMatchObject({p_owner:auth.userId,p_organization:auth.organizationId,p_channel:'walmart-us',p_version:prepared.updated_at,p_hash:prepared.content_hash,p_target:{account_id:'100009',marketplace_id:'US',operation:'walmart_mp_item'}});
  expect(JSON.stringify(db.get())).not.toContain('synthetic-secret-message');
 });
 it('retains confirmed feedId when accepted checkpoint fails and ingestion never becomes published',async()=>{
  const db=database();const prepared=await prepareWalmart(db.db,auth,'SYNTHETIC-WM');db.failAccepted();vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({feedId:'SYNTHETIC@US'}),{status:200})));
  await expect(submitWalmart(db.db,auth,{sku:prepared.sku,expected_hash:prepared.request_hash,confirm:true})).rejects.toThrow();expect(db.get()).toMatchObject({status:'unknown',response:{feed_id:'SYNTHETIC@US'}});
  mocks.page.mockResolvedValue({complete:true,next_offset:null,feed_status:'PROCESSED',outcomes:[{sku:prepared.sku,status:'accepted',publication_status:'not_verified'}]});
  const result=await monitorWalmart(db.db,auth,prepared.sku);expect(result.output).toMatchObject({status:'accepted',publication_status:'not_verified',requires_item_readback:true});expect(db.get().status).toBe('accepted');
  expect(mocks.persist).toHaveBeenCalled();const persisted=mocks.persist.mock.calls[0][2];expect(persisted._catalog.channels['walmart-us'].submission.verified_content_hash).toBeUndefined();
 });
 it('keeps incomplete details unchanged and rejects wrong account or unresolved feed identity',async()=>{
  const db=database();const prepared=await prepareWalmart(db.db,auth,'SYNTHETIC-WM');vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({feedId:'SYNTHETIC@US'}),{status:200})));await submitWalmart(db.db,auth,{sku:prepared.sku,expected_hash:prepared.request_hash,confirm:true});
  mocks.page.mockResolvedValue({complete:false,next_offset:0,feed_status:'INPROGRESS',outcomes:[]});expect((await monitorWalmart(db.db,auth,prepared.sku)).output.matched).toBe(false);expect(db.get().status).toBe('accepted');
  const foreign={...db.get(),target:{...db.get().target,account_id:'foreign'}};db.set(foreign);await expect(monitorWalmart(db.db,auth,prepared.sku)).rejects.toMatchObject({status:409});
  db.set({...foreign,target:prepared.target,response:{}});await expect(monitorWalmart(db.db,auth,prepared.sku)).rejects.toThrow('feedId não confirmado');
 });
});
