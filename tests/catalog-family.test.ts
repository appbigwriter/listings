import {beforeEach,describe,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({load:vi.fn(),readback:vi.fn(),ready:vi.fn()}));
vi.mock('../lib/catalog/repository',async original=>({...await original<any>(),loadProduct:mocks.load}));
vi.mock('../lib/catalog/readiness',()=>({evaluateReadiness:mocks.ready}));
vi.mock('../lib/marketplaces/amazon',async original=>({...await original<any>(),amazonReadback:mocks.readback}));
import {assertFamily} from '../lib/catalog/family';
import {buildAmazonFeed} from '../lib/catalog/feed';
import {createCatalog,contentHash} from '../lib/catalog/model';
import {amazonPayload} from '../lib/marketplaces/amazon';
const auth={userId:'owner',organizationId:'org',mode:'supabase-session' as const};
function family(){
 const parent={sku:'PARENT',title:'Parent sign',brand:'FBR',relationship:'Parent',variation:'COLOR',_catalog:createCatalog({sku:'PARENT'})};
 parent._catalog.kind='physical';parent._catalog.channels['amazon-us']={product_type:'SIGN',category:'signs',attributes:{}};
 const child={...structuredClone(parent),sku:'CHILD',relationship:'Child',parent_sku:parent.sku,color:'Blue'};
 return {parent,child};
}
beforeEach(()=>{vi.resetAllMocks();mocks.ready.mockReturnValue({ready:true,issues:[]});const {parent}=family();mocks.load.mockResolvedValue({product:parent,row:{updated_at:'2026-10-06T02:40:00Z'}});mocks.readback.mockResolvedValue({sku:parent.sku,summaries:[{marketplaceId:'ATVPDKIKX0DER'}],attributes:amazonPayload(parent).attributes});vi.stubEnv('AMAZON_SP_API_SELLER_ID','SELLER');});
describe('family identity and publication dependencies',()=>{
 it('rejects brand, category, kind and theme mismatches without external reads',async()=>{
  const {child}=family();
  for(const change of [{brand:'OTHER'},{variation:'SIZE'},{_catalog:{...child._catalog,kind:'custom' as const}},{_catalog:{...child._catalog,channels:{'amazon-us':{product_type:'SIGN',category:'other',attributes:{}}}}}])await expect(assertFamily({} as any,auth,{...child,...change},'amazon-us')).rejects.toMatchObject({status:422});
  expect(mocks.readback).not.toHaveBeenCalled();
 });
 it('requires the approved parent and matches its external content without requiring parent buyability',async()=>{
  const {parent,child}=family(),reference=await assertFamily({} as any,auth,child,'amazon-us',true);
  expect(reference).toMatchObject({sku:parent.sku,updated_at:'2026-10-06T02:40:00Z',content_hash:contentHash(parent),readback_hash:expect.stringMatching(/^[a-f0-9]{64}$/)});
  mocks.ready.mockReturnValue({ready:false,issues:[]});await expect(assertFamily({} as any,auth,child,'amazon-us',true)).rejects.toThrow('aprove o pai');
  mocks.ready.mockReturnValue({ready:true,issues:[]});mocks.readback.mockResolvedValue({sku:parent.sku,summaries:[{marketplaceId:'ATVPDKIKX0DER'}],attributes:{item_name:[{value:'Wrong title'}]}});
  await expect(assertFamily({} as any,auth,child,'amazon-us',true)).rejects.toThrow('pai não foi comprovado');
 });
 it('requires the active parent in family feeds, preserves order and never adds a parent offer',()=>{
  const {parent,child}=family();expect(()=>buildAmazonFeed([child])).toThrow('Inclua o pai');
  const feed=buildAmazonFeed([child,parent]);expect(feed.messages.map(message=>message.sku)).toEqual(['PARENT','CHILD']);
  expect(feed.messages[0].attributes).not.toHaveProperty('purchasable_offer');
  expect(feed.messages[1].attributes.child_parent_sku_relationship).toEqual([{marketplace_id:'ATVPDKIKX0DER',child_relationship_type:'variation',parent_sku:'PARENT'}]);
 });
});
