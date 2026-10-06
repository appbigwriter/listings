import {beforeEach,describe,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({request:vi.fn(),account:vi.fn(),load:vi.fn(),persist:vi.fn()}));
vi.mock('../lib/marketplaces/ebay',async(importOriginal)=>({...await importOriginal<any>(),ebayRequest:mocks.request,assertEbayAccount:mocks.account,ebayConfig:()=>({accountId:'ACCOUNT',marketplaceId:'EBAY_US',configured:true})}));
vi.mock('../lib/catalog/repository',async(importOriginal)=>({...await importOriginal<any>(),loadProduct:mocks.load,persistProduct:mocks.persist}));
vi.mock('../lib/catalog/readiness',()=>({evaluateReadiness:()=>({ready:true,issues:[]})}));
import {prepareEbay,submitEbay,monitorEbay,expectedFieldsMatch} from '../lib/catalog/ebay-executor';
import {EbayError} from '../lib/marketplaces/ebay';
import {createCatalog,contentHash} from '../lib/catalog/model';
import {buildEbayPackage} from '../lib/marketplaces/ebay-package';
const auth={userId:'owner',organizationId:'org',mode:'supabase-session' as const,roles:['admin'] as const};
const product=()=>{const p:any={sku:'SKU',title:'Steel sign',description:'Steel',brand:'FBRSigns',mpn:'S1',qty:1,price:12.5,images:['https://example.com/a.jpg'],pkg_length:10,pkg_width:10,pkg_height:1,pkg_weight:1,ebay_condition:'NEW',ebay_location:'warehouse',ebay_payment_policy:'1',ebay_return_policy:'2',ebay_fulfillment_policy:'3',_catalog:createCatalog({})};p._catalog.channels['ebay-us']={product_type:'SIGN',category:'123',attributes:{Material:['Steel']}};return p;};
function database(record?:any) {
 const writes:any[]=[];const db:any={rpc:vi.fn().mockResolvedValue({data:'claim',error:null}),from:()=>{const query:any={eq:()=>query,select:()=>query,order:()=>query,limit:()=>query,update:(values:any)=>{writes.push(values);return query;},maybeSingle:()=>Promise.resolve({data:record||{id:'claim'},error:null})};return query;}};
 return {db,writes};
}
beforeEach(()=>{
 vi.clearAllMocks();vi.stubEnv('PRELISTING_ENABLE_PUBLICATION','true');vi.stubEnv('PRELISTING_ENABLE_EBAY_PUBLICATION','true');
 mocks.account.mockResolvedValue({account_id:'ACCOUNT',marketplace_id:'EBAY_US'});mocks.load.mockResolvedValue({product:product(),row:{updated_at:'2026-10-05T18:00:00Z'}});mocks.persist.mockResolvedValue({id:'product'});
 mocks.request.mockImplementation(async(path:string,method='GET')=>{
  if(path.includes('/payment_policy/'))return {paymentPolicyId:'1',marketplaceId:'EBAY_US'};
  if(path.includes('/return_policy/'))return {returnPolicyId:'2',marketplaceId:'EBAY_US'};
  if(path.includes('/fulfillment_policy/'))return {fulfillmentPolicyId:'3',marketplaceId:'EBAY_US'};
  if(path.includes('/location/'))return {merchantLocationKey:'warehouse',merchantLocationStatus:'ENABLED'};
  if(path.includes('get_item_condition_policies'))return {itemConditionPolicies:[{categoryId:'123',itemConditions:[{conditionId:'1000'}]}]};
  if(method==='GET')throw new EbayError(404);
  if(method==='PUT')return {};
  if(path.endsWith('/publish'))return {listingId:'456'};
  return {offerId:'123'};
 });
});
describe('guarded eBay standalone publication',()=>{
 const publisher={...auth,roles:['admin'] as ('admin')[]};
 it('reserves the reviewed version before PUT/createOffer/publish and checkpoints the returned IDs',async()=>{
  const {db,writes}=database(),prepared=await prepareEbay(db,publisher,'SKU');
  expect(await submitEbay(db,publisher,{sku:'SKU',expected_hash:prepared.request_hash,confirm:true})).toMatchObject({status:'accepted',offer_id:'123',listing_id:'456'});
  expect(db.rpc).toHaveBeenCalledWith('reserve_catalog_channel_submission',expect.objectContaining({p_channel:'ebay-us',p_version:'2026-10-05T18:00:00Z'}));
  expect(writes.map(write=>write.response.stage)).toEqual(['inventory_request_started','offer_request_started','publish_request_started','publish_response_received']);
  expect(writes.at(-1).status).toBe('accepted');
 });
 it('keeps uncertainty and known offer ID after a publish timeout',async()=>{
  const original=mocks.request.getMockImplementation()!;mocks.request.mockImplementation(async(path:string,method?:string)=>{if(path.endsWith('/publish'))throw new Error('timeout');return original(path,method);});
  const {db,writes}=database(),prepared=await prepareEbay(db,publisher,'SKU');await expect(submitEbay(db,publisher,{sku:'SKU',expected_hash:prepared.request_hash,confirm:true})).rejects.toThrow('timeout');
  expect(writes.at(-1)).toMatchObject({status:'unknown',response:{stage:'publish_request_started',offer_id:'123'}});
 });
 it('does not replace inventory already owned by another listing workflow',async()=>{
  const original=mocks.request.getMockImplementation()!;mocks.request.mockImplementation(async(path:string,method?:string)=>path.includes('/inventory_item/')&&(!method||method==='GET')?{sku:'SKU'}:original(path,method));
  const {db}=database(),prepared=await prepareEbay(db,publisher,'SKU');await expect(submitEbay(db,publisher,{sku:'SKU',expected_hash:prepared.request_hash,confirm:true})).rejects.toMatchObject({status:409});expect(db.rpc).not.toHaveBeenCalled();expect(mocks.request.mock.calls.every(call=>call[1]===undefined)).toBe(true);
 });
 it('performs no external write if the atomic version reservation fails',async()=>{
  const {db}=database();db.rpc.mockResolvedValueOnce({error:{code:'version_changed'},data:null});const prepared=await prepareEbay(db,publisher,'SKU');await expect(submitEbay(db,publisher,{sku:'SKU',expected_hash:prepared.request_hash,confirm:true})).rejects.toMatchObject({status:409});expect(mocks.request.mock.calls.every(call=>call[1]===undefined)).toBe(true);
 });
 it('blocks disabled publication, a changed manifest and mismatching business policies',async()=>{
  const {db}=database();vi.stubEnv('PRELISTING_ENABLE_EBAY_PUBLICATION','false');await expect(submitEbay(db,publisher,{sku:'SKU',confirm:true})).rejects.toMatchObject({status:403});expect(mocks.account).not.toHaveBeenCalled();
  vi.stubEnv('PRELISTING_ENABLE_EBAY_PUBLICATION','true');await expect(submitEbay(db,publisher,{sku:'SKU',expected_hash:'old',confirm:true})).rejects.toMatchObject({status:409});expect(db.rpc).not.toHaveBeenCalled();
  const prepared=await prepareEbay(db,publisher,'SKU');const original=mocks.request.getMockImplementation()!;mocks.request.mockImplementation(async(path:string)=>path.includes('/payment_policy/')?{paymentPolicyId:'1',marketplaceId:'EBAY_GB'}:original(path));await expect(submitEbay(db,publisher,{sku:'SKU',expected_hash:prepared.request_hash,confirm:true})).rejects.toMatchObject({status:422});expect(db.rpc).not.toHaveBeenCalled();
 });
 it('resolves a publish timeout only through matching current inventory/offer and a published listing ID',async()=>{
  const p=product(),pack=buildEbayPackage(p),{db,writes}=database({id:'claim',status:'unknown',created_at:new Date(Date.now()-300000).toISOString(),target:{account_id:'ACCOUNT',marketplace_id:'EBAY_US'},request_hash:contentHash(p,'ebay-us'),request_payload:{inventory:pack.inventory,offer:pack.offer},response:{offer_id:'123'}});
  mocks.request.mockImplementation(async(path:string)=>path.includes('/inventory_item/')?{...pack.inventory,sku:'SKU'}:{...pack.offer,status:'PUBLISHED',listing:{listingId:'456'}});
  expect((await monitorEbay(db,publisher,'SKU')).output).toMatchObject({matched:true,status:'published'});expect(writes[0].status).toBe('published');expect(mocks.persist).toHaveBeenCalledWith(db,publisher,expect.objectContaining({_catalog:expect.objectContaining({channels:expect.objectContaining({'ebay-us':expect.objectContaining({submission:expect.objectContaining({verified_content_hash:contentHash(p,'ebay-us'),verified_at:expect.any(String)})})})})}),expect.anything());
 });
 it('never infers publication from an ID or title alone',()=>{
  expect(expectedFieldsMatch({price:{value:'12.50'}},{price:{value:'12.50'},extra:true})).toBe(true);
  expect(expectedFieldsMatch({title:'Sign',price:'12.50'},{title:'Sign'})).toBe(false);expect(expectedFieldsMatch({qty:1},{qty:2})).toBe(false);
 });
});
