import {beforeEach,describe,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({load:vi.fn(),persist:vi.fn(),submit:vi.fn(),request:vi.fn(),readback:vi.fn(),rpc:vi.fn(),update:vi.fn()}));
vi.mock('../lib/catalog/repository',async original=>({...await original<any>(),loadProduct:mocks.load,persistProduct:mocks.persist,scopeQuery:(query:any)=>query}));
vi.mock('../lib/catalog/family',()=>({assertFamily:async()=>undefined}));
vi.mock('../lib/catalog/readiness',()=>({evaluateReadiness:()=>({ready:true,issues:[]})}));
vi.mock('../lib/marketplaces/amazon',()=>({amazonConfig:()=>({sellerId:'SELLER',marketplaceId:'ATVPDKIKX0DER'}),amazonPayload:()=>({productType:'SIGN',attributes:{item_name:[{value:'Sign'}]}}),amazonSubmit:mocks.submit,amazonRequest:mocks.request,amazonReadback:mocks.readback}));
import {executeAction} from '../lib/catalog/executor';
import {prepareOffer,submitOffer} from '../lib/catalog/offers';
import {contentHash,createCatalog} from '../lib/catalog/model';
const auth={userId:'owner',organizationId:'org',roles:['admin' as const],mode:'supabase-session' as const};
const product={sku:'FBR-CAS',title:'Sign',price:20,qty:3,asin:'B012345678',fulfillment:'FBM',_catalog:createCatalog({sku:'FBR-CAS',product_type:'SIGN'})};
const version='2026-10-05T12:00:00.000Z';
const db={rpc:mocks.rpc,from:()=>({update:mocks.update})};
beforeEach(()=>{
 vi.resetAllMocks();vi.stubEnv('PRELISTING_ENABLE_PUBLICATION','true');vi.stubEnv('PRELISTING_ENABLE_OFFER_PATCH','true');
 mocks.load.mockResolvedValue({row:{id:'product',updated_at:version},product:structuredClone(product)});mocks.persist.mockResolvedValue({id:'product'});
 mocks.rpc.mockResolvedValue({data:'claim',error:null});mocks.submit.mockResolvedValue({status:'ACCEPTED'});mocks.request.mockResolvedValue({status:'ACCEPTED'});mocks.readback.mockResolvedValue({sku:product.sku,summaries:[{marketplaceId:'ATVPDKIKX0DER',asin:product.asin}]});
 mocks.update.mockImplementation(()=>{const query:any={eq:()=>query,select:()=>query,maybeSingle:async()=>({data:{id:'claim'},error:null}),then:(resolve:any)=>Promise.resolve({error:null}).then(resolve)};return query;});
});
describe('Amazon version reservation before external writes',()=>{
 it('blocks a PATCH to an existing SKU with a different ASIN before reservation or mutation',async()=>{
  const prepared=await prepareOffer(db as any,auth,product.sku,['price'],'prelisting');mocks.readback.mockResolvedValue({sku:product.sku,summaries:[{marketplaceId:'ATVPDKIKX0DER',asin:'B099999999'}]});
  await expect(submitOffer(db as any,auth,{sku:product.sku,fields:['price'],authority:'prelisting',confirm:true,expected_hash:prepared.request_hash})).rejects.toThrow('ASIN existentes');expect(mocks.rpc).not.toHaveBeenCalled();expect(mocks.request).not.toHaveBeenCalled();
 });
 it('keeps an unrecognized successful HTTP response uncertain instead of releasing it as rejected',async()=>{
  mocks.submit.mockResolvedValue({message:'No item status'});
  await expect(executeAction(db as any,auth,product.sku,'submit',{confirm:true,expected_hash:contentHash(product)})).rejects.toThrow('sem resultado comprovado');expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({status:'unknown'}));expect(mocks.update).not.toHaveBeenCalledWith(expect.objectContaining({status:'rejected'}));
 });
 it('blocks PUT when the database version claim conflicts',async()=>{
  mocks.rpc.mockResolvedValue({error:{message:'Product version changed'}});
  await expect(executeAction(db as any,auth,product.sku,'submit',{confirm:true,expected_hash:contentHash(product)})).rejects.toThrow('Versão alterada');expect(mocks.submit).not.toHaveBeenCalled();
 });
 it('reserves the exact PUT version and records its returned claim ID',async()=>{
  await executeAction(db as any,auth,product.sku,'submit',{confirm:true,expected_hash:contentHash(product)});
  expect(mocks.rpc).toHaveBeenCalledWith('reserve_catalog_channel_submission',expect.objectContaining({p_version:version,p_sku:product.sku,p_hash:contentHash(product),p_target:{seller_id:'SELLER',marketplace_id:'ATVPDKIKX0DER',operation:'listing_put'}}));expect(mocks.submit).toHaveBeenCalledTimes(1);
 });
 it('blocks PATCH after a concurrent version change even when the prepared offer was reviewed',async()=>{
  const prepared=await prepareOffer(db as any,auth,product.sku,['price'],'prelisting');mocks.rpc.mockResolvedValue({error:{message:'Product version changed'}});
  await expect(submitOffer(db as any,auth,{sku:product.sku,fields:['price'],authority:'prelisting',confirm:true,expected_hash:prepared.request_hash})).rejects.toThrow('Oferta mudou');expect(mocks.request).not.toHaveBeenCalled();
 });
});
