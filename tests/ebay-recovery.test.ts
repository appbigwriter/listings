import {beforeEach,describe,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({load:vi.fn(),account:vi.fn(),request:vi.fn()}));
vi.mock('../lib/catalog/repository',async original=>({...await original<any>(),loadProduct:mocks.load}));
vi.mock('../lib/marketplaces/ebay',async original=>({...await original<any>(),ebayConfig:()=>({accountId:'ACCOUNT',marketplaceId:'EBAY_US'}),assertEbayAccount:mocks.account,ebayRequest:mocks.request}));
import {ebayRecoveryCandidates,recoverEbayOffer} from '../lib/catalog/ebay-recovery';
const auth={userId:'owner',organizationId:'org',mode:'supabase-session' as const,roles:['admin' as const]};
const inventory={sku:'SKU',product:{title:'Sign'},availability:{shipToLocationAvailability:{quantity:1}}},offer={sku:'SKU',marketplaceId:'EBAY_US',format:'FIXED_PRICE',pricingSummary:{price:{value:'20.00',currency:'USD'}}};
function record(){return {id:'claim',status:'unknown',updated_at:'2026-10-06T03:00:00Z',created_at:new Date(Date.now()-600000).toISOString(),target:{account_id:'ACCOUNT',marketplace_id:'EBAY_US'},response:{stage:'offer_request_started'},request_payload:{inventory,offer}};}
const observed=()=>({...offer,offerId:'123',status:'UNPUBLISHED'});
function database(row=record(),conflict=false){
 const writes:any[]=[],filters:any[]=[];const db:any={from:()=>{let updating=false;const q:any={select:()=>q,eq:(...args:any[])=>{filters.push(args);return q;},order:()=>q,limit:()=>q,update:(body:any)=>{updating=true;writes.push(body);return q;},maybeSingle:async()=>({data:updating?(conflict?null:{id:row.id}):row,error:null})};return q;}};
 return {db,writes,filters};
}
beforeEach(()=>{vi.resetAllMocks();mocks.load.mockResolvedValue({row:{sku:'SKU'},product:{sku:'SKU'}});mocks.account.mockResolvedValue({account_id:'ACCOUNT'});mocks.request.mockImplementation(async(path:string)=>path.includes('/inventory_item/')?inventory:path.includes('/offer?')?{total:1,offers:[observed()]}:observed());});
describe('attested recovery of lost eBay offer identity',()=>{
 it('queries matching candidates without associating an ID, creating an offer or publishing',async()=>{
  const {db,writes,filters}=database(),result=await ebayRecoveryCandidates(db,auth,'SKU');expect(result).toMatchObject({claim_id:'claim',candidates:[{offer_id:'123',status:'UNPUBLISHED'}],publication:'not_changed',ownership:'administrator_attestation_required'});
  expect(writes).toHaveLength(0);expect(mocks.request.mock.calls.every(call=>call[1]===undefined)).toBe(true);
  expect(filters).toContainEqual(['owner_id',auth.userId]);expect(filters).toContainEqual(['organization_id',auth.organizationId]);
 });
 it('requires confirmation/evidence and atomically attaches only a freshly matching offer while retaining uncertainty',async()=>{
  const row=record(),{db,writes}=database(row),body={sku:'SKU',offer_id:'123',claim_id:row.id,expected_version:row.updated_at,evidence:'Matched original request and exclusive SKU ownership in Seller Hub.',confirm:true};
  await expect(recoverEbayOffer(db,auth,{...body,confirm:false})).rejects.toMatchObject({status:403});expect(mocks.request).not.toHaveBeenCalled();
  expect(await recoverEbayOffer(db,auth,body)).toMatchObject({status:'unknown',offer_id:'123',publication:'not_changed'});expect(writes).toHaveLength(1);expect(writes[0]).not.toHaveProperty('status');
  expect(writes[0].response).toMatchObject({offer_id:'123',recovery:{actor:auth.userId,identity:'administrator_attested',observed_status:'UNPUBLISHED'}});expect(mocks.request.mock.calls.every(call=>call[1]===undefined)).toBe(true);
 });
 it('rejects another account, a ledger before offer creation and an incomplete remote population',async()=>{
  await expect(ebayRecoveryCandidates(database({...record(),target:{account_id:'OTHER',marketplace_id:'EBAY_US'}}).db,auth,'SKU')).rejects.toMatchObject({status:409});expect(mocks.account).not.toHaveBeenCalled();
  await expect(ebayRecoveryCandidates(database({...record(),response:{stage:'inventory_request_started'}}).db,auth,'SKU')).rejects.toMatchObject({status:409});
  mocks.request.mockImplementation(async(path:string)=>path.includes('/inventory_item/')?inventory:{total:51,offers:[observed()],next:'remote-next'});
  await expect(ebayRecoveryCandidates(database().db,auth,'SKU')).rejects.toMatchObject({status:413});
 });
 it('does not associate a mismatched SKU or overwrite a ledger changed during the readback',async()=>{
  const row=record(),body={sku:'SKU',offer_id:'123',claim_id:row.id,expected_version:row.updated_at,evidence:'Verified with original request and Seller Hub.',confirm:true};
  const mismatched=database(row);mocks.request.mockImplementation(async(path:string)=>path.includes('/inventory_item/')?inventory:{...observed(),sku:'OTHER'});
  await expect(recoverEbayOffer(mismatched.db,auth,body)).rejects.toMatchObject({status:422});expect(mismatched.writes).toHaveLength(0);
  mocks.request.mockImplementation(async(path:string)=>path.includes('/inventory_item/')?inventory:observed());await expect(recoverEbayOffer(database(row,true).db,auth,body)).rejects.toMatchObject({status:409});
 });
});
