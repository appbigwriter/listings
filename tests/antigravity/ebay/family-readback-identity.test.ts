import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({request:vi.fn(),load:vi.fn(),persist:vi.fn(),identity:vi.fn()}));
vi.mock('../../../lib/marketplaces/ebay',async original=>({...await original<typeof import('../../../lib/marketplaces/ebay')>(),ebayRequest:mocks.request,assertEbayAccount:mocks.identity,ebayConfig:()=>({accountId:'account'})}));
vi.mock('../../../lib/catalog/repository',async original=>({...await original<typeof import('../../../lib/catalog/repository')>(),loadProduct:mocks.load,persistProduct:mocks.persist}));
import {monitorEbayFamily} from '../../../lib/catalog/ebay-family-executor';
import {contentHash,createCatalog,type ProductInput} from '../../../lib/catalog/model';
const auth={userId:'owner',organizationId:'org',roles:['admin' as const],mode:'supabase-session' as const};
function setup(){
 const products=Object.fromEntries(['PARENT','RED','BLUE'].map(sku=>{const product:ProductInput={sku,title:'Sign',_catalog:createCatalog({})};product._catalog!.channels['ebay-us']={product_type:'SIGN',category:'123',attributes:{}};return [sku,product];}));
 const group={title:'Sign',variantSKUs:['RED','BLUE']},members=['RED','BLUE'].map(sku=>({sku,inventory:{condition:'NEW',product:{title:'Sign'}},offer:{sku,marketplaceId:'EBAY_US',format:'FIXED_PRICE'}}));
 const claim={id:'claim',sku:'PARENT',status:'accepted',updated_at:new Date().toISOString(),target:{account_id:'account',marketplace_id:'EBAY_US',operation:'family_group'},request_payload:{group,members},response:{offers:{RED:'1',BLUE:'2'},listing_id:'3'}};
 const versions=['PARENT','RED','BLUE'].map(sku=>({sku,request_hash:contentHash(products[sku],'ebay-us'),created_at:new Date().toISOString(),response:{offer_id:sku==='RED'?'1':sku==='BLUE'?'2':undefined}}));
 const filters:unknown[][]=[];
 const db:any={rpc:vi.fn(async()=>({data:new Date().toISOString(),error:null})),from:()=>{
  let selected='';const query:any={select:(value:string)=>{selected=value;return query;},eq:(...args:unknown[])=>{filters.push(args);return query;},neq:()=>query,order:()=>query,limit:()=>query,maybeSingle:async()=>({data:claim,error:null}),then:(resolve:(value:unknown)=>void)=>Promise.resolve({data:selected==='sku,request_hash,response'?versions.filter(row=>row.sku!=='PARENT'):versions,error:null}).then(resolve)};return query;
 }};
 const observed={group:{...group,inventoryItemGroupKey:'PARENT'},inventory:Object.fromEntries(members.map(member=>[member.sku,{...member.inventory,sku:member.sku,inventoryItemGroupKeys:['PARENT']}])),offer:Object.fromEntries(members.map((member,index)=>[String(index+1),{...member.offer,offerId:String(index+1),status:'PUBLISHED',listing:{listingId:'3'}}]))};
 mocks.request.mockImplementation(async(path:string)=>{if(path.includes('/inventory_item_group/'))return observed.group;if(path.includes('/inventory_item/'))return observed.inventory[path.split('/').at(-1)!];if(path.includes('/offer/'))return observed.offer[path.split('/').at(-1)!];throw new Error('Unexpected synthetic read');});
 mocks.load.mockImplementation(async(_db:unknown,_auth:unknown,sku:string)=>({row:{sku,updated_at:new Date().toISOString()},product:structuredClone(products[sku])}));mocks.persist.mockResolvedValue({});mocks.identity.mockResolvedValue({account_id:'account'});
 return {db,claim,observed,filters};
}
beforeEach(()=>vi.resetAllMocks());afterEach(()=>vi.unstubAllEnvs());
describe('family readback requires exact remote identities',()=>{
 it('proves all members of the expected listing with owner/org scoped ledgers and GET only',async()=>{
  const {db,filters}=setup();expect(await monitorEbayFamily(db,auth,'PARENT')).toMatchObject({matched:true,status:'published',listing_id:'3'});
  expect(filters).toContainEqual(['owner_id','owner']);expect(filters).toContainEqual(['organization_id','org']);expect(mocks.request.mock.calls.every(call=>call.length===1)).toBe(true);expect(mocks.persist).toHaveBeenCalledTimes(3);
 });
 for(const field of ['groupKey','inventorySku','offerId','listingId'] as const)it(`refuses ${field} mismatch before any checkpoint/projection`,async()=>{
  const {db,observed}=setup();
  if(field==='groupKey')observed.group.inventoryItemGroupKey='OTHER';
  if(field==='inventorySku')observed.inventory.RED.sku='OTHER';
  if(field==='offerId')observed.offer['1'].offerId='999';
  if(field==='listingId')for(const offer of Object.values(observed.offer))offer.listing.listingId='999';
  const result=await monitorEbayFamily(db,auth,'PARENT').catch(()=>null);
  expect(result?.matched).not.toBe(true);expect(db.rpc).not.toHaveBeenCalled();expect(mocks.persist).not.toHaveBeenCalled();
 });
 it('rechecks worker ownership before the durable checkpoint and refuses expired lease without product writes',async()=>{
  const {db}=setup();let checks=0;const lease=vi.fn(async()=>{if(++checks===3)throw new Error('Synthetic worker lease lost');});
  await expect(monitorEbayFamily(db,auth,'PARENT',lease)).rejects.toThrow('lease lost');expect(lease).toHaveBeenCalledTimes(3);expect(db.rpc).not.toHaveBeenCalled();expect(mocks.persist).not.toHaveBeenCalled();
 });
 it('never projects publication after an unconfirmed checkpoint acknowledgement',async()=>{
  const {db}=setup();db.rpc.mockResolvedValueOnce({data:null,error:{message:'synthetic CAS conflict'}});
  await expect(monitorEbayFamily(db,auth,'PARENT')).rejects.toMatchObject({status:503});expect(mocks.persist).not.toHaveBeenCalled();expect(mocks.request.mock.calls.every(call=>call.length===1)).toBe(true);
 });
});
