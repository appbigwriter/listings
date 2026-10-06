import {beforeEach,afterEach,describe,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({prepare:vi.fn(),request:vi.fn(),business:vi.fn(),identity:vi.fn()}));
vi.mock('../lib/catalog/ebay-family',()=>({prepareEbayFamily:mocks.prepare}));
vi.mock('../lib/marketplaces/ebay',async original=>({...await original<any>(),ebayRequest:mocks.request,assertEbayAccount:mocks.identity}));
vi.mock('../lib/catalog/ebay-executor',async original=>({...await original<any>(),assertBusinessPreparation:mocks.business}));
import {submitEbayFamily} from '../lib/catalog/ebay-family-executor';
import {EbayError} from '../lib/marketplaces/ebay';
const auth={userId:'owner',organizationId:'org',roles:['admin' as const],mode:'supabase-session' as const},parentId='00000000-0000-4000-8000-000000000001';
function fixture(){return {groupKey:'PARENT',group:{variantSKUs:['RED','BLUE']},members:['RED','BLUE'].map(sku=>({sku,inventory:{product:{title:sku}},offer:{sku}})),manifest:{parent:{sku:'PARENT',updated_at:new Date().toISOString(),content_hash:'a'.repeat(64)},members:['RED','BLUE'].map(sku=>({sku,updated_at:new Date().toISOString(),content_hash:'b'.repeat(64)}))},target:{seller_id:'account'},guard:{ready:true},request_hash:'c'.repeat(64)};}
function database(){
 const calls:any[]=[],claim={id:parentId,status:'submitting',updated_at:new Date().toISOString()},rpc=vi.fn(async(name:string,args:any)=>{calls.push(['rpc',name,args]);return {data:name==='reserve_ebay_family_submission'?parentId:new Date(Date.now()+calls.length).toISOString(),error:null};});
 const query:any={select:()=>query,eq:()=>query,maybeSingle:async()=>({data:claim,error:null})};return {db:{from:()=>query,rpc} as any,calls,rpc};
}
beforeEach(()=>{
 vi.resetAllMocks();for(const key of ['PRELISTING_ENABLE_PUBLICATION','PRELISTING_ENABLE_EBAY_PUBLICATION','PRELISTING_ENABLE_EBAY_FAMILY_PUBLICATION'])vi.stubEnv(key,'true');vi.stubEnv('PRELISTING_RECOVERY_MODE','false');mocks.prepare.mockResolvedValue(fixture());mocks.business.mockResolvedValue({});
 let offer=0;mocks.request.mockImplementation(async(path:string,method='GET')=>{if(method==='GET'){if(path.includes('/offer?'))return {offers:[],total:0};throw new EbayError(404);}if(path.endsWith('publish_by_inventory_item_group'))return {listingId:'3'};if(path==='/sell/inventory/v1/offer')return {offerId:String(++offer)};return {};});
});
afterEach(()=>vi.unstubAllEnvs());
describe('provisioned family publication with synthetic transport',()=>{
 it('checks absence, reserves the whole family before any write, and stores accepted only after publish response',async()=>{
  const {db,calls}=database();
  const base=mocks.request.getMockImplementation()!;mocks.request.mockImplementation(async(...args:any[])=>{calls.push(['transport',...args]);return base(args[0],args[1],args[2]);});
  const result=await submitEbayFamily(db,auth,{sku:'PARENT',confirm:true,expected_hash:'c'.repeat(64)});
  expect(result).toMatchObject({status:'accepted',listing_id:'3'});
  expect(calls.findIndex(item=>item[0]==='rpc'&&item[1]==='reserve_ebay_family_submission')).toBeLessThan(calls.findIndex(item=>item[0]==='transport'&&item[2]==='PUT'));
  expect(mocks.request).toHaveBeenCalledWith('/sell/inventory/v1/offer/publish_by_inventory_item_group','POST',{inventoryItemGroupKey:'PARENT',marketplaceId:'EBAY_US'});
  expect(calls.filter(item=>item[0]==='rpc').at(-1)[2]).toMatchObject({p_status:'accepted',p_response:{offers:{RED:'1',BLUE:'2'},listing_id:'3'}});
 });
 it('keeps every claim unknown and preserves known IDs when offer response is lost; never auto publishes or retries',async()=>{
  const {db,rpc}=database();let offer=0;const base=mocks.request.getMockImplementation()!;
  mocks.request.mockImplementation(async(path:string,method='GET',body?:unknown)=>{if(path==='/sell/inventory/v1/offer'&&++offer===2)throw new TypeError('synthetic lost response');return base(path,method,body);});
  await expect(submitEbayFamily(db,auth,{sku:'PARENT',confirm:true,expected_hash:'c'.repeat(64)})).rejects.toThrow('lost response');
  expect(rpc.mock.calls.at(-1)?.[1]).toMatchObject({p_status:'unknown',p_response:{offers:{RED:'1'},stage:'offer_request_started'}});
  expect(mocks.request.mock.calls.filter(([path])=>path==='/sell/inventory/v1/offer')).toHaveLength(2);expect(mocks.request.mock.calls.some(([path])=>path.includes('publish_by'))).toBe(false);
 });
 it('blocks disabled/recovery paths and changed manifests before reservation or external writes',async()=>{
  const {db,rpc}=database();vi.stubEnv('PRELISTING_RECOVERY_MODE','true');await expect(submitEbayFamily(db,auth,{sku:'PARENT',confirm:true})).rejects.toMatchObject({status:503});expect(mocks.request).not.toHaveBeenCalled();
  vi.stubEnv('PRELISTING_RECOVERY_MODE','false');await expect(submitEbayFamily(db,auth,{sku:'PARENT',confirm:true,expected_hash:'old'})).rejects.toMatchObject({status:422});expect(rpc).not.toHaveBeenCalled();
 });
});
