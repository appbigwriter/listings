import {beforeEach,describe,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({readback:vi.fn()}));
vi.mock('../lib/marketplaces/amazon',async original=>({...await original<any>(),amazonReadback:mocks.readback}));
import {applyAction} from '../lib/catalog/actions';
import {createCatalog,contentHash} from '../lib/catalog/model';
import {amazonPayload} from '../lib/marketplaces/amazon';
const auth={userId:'owner',organizationId:'org',mode:'supabase-session' as const};
const product={sku:'FBR-PROOF',title:'Steel sign',brand:'FBRSigns',price:20,qty:1,fulfillment:'FBM',_catalog:createCatalog({sku:'FBR-PROOF',product_type:'SIGN'})};
beforeEach(()=>{vi.resetAllMocks();});
describe('current Amazon readback proof',()=>{
 it('does not treat another version of a buyable listing as current publication',async()=>{
  mocks.readback.mockResolvedValue({sku:product.sku,summaries:[{marketplaceId:'ATVPDKIKX0DER',status:['BUYABLE']}],attributes:{item_name:[{value:'Different sign'}]}});
  const monitored=await applyAction(product,auth,'monitor',{channel:'amazon-us'});
  expect(monitored.product._catalog!.channels['amazon-us']!.submission).toMatchObject({status:'unknown',publication_status:'not_buyable'});expect(monitored.product._catalog!.channels['amazon-us']!.submission?.verified_content_hash).toBeUndefined();
 });
 it('records a proof only when attributes match and BUYABLE has no error',async()=>{
  mocks.readback.mockResolvedValue({sku:product.sku,summaries:[{marketplaceId:'ATVPDKIKX0DER',status:['BUYABLE']}],attributes:amazonPayload(product).attributes});
  const monitored=await applyAction(product,auth,'monitor',{channel:'amazon-us'});
  expect(monitored.product._catalog!.channels['amazon-us']!.submission).toMatchObject({status:'published',publication_status:'buyable',verified_content_hash:contentHash(product)});
  mocks.readback.mockResolvedValue({sku:product.sku,summaries:[{marketplaceId:'ATVPDKIKX0DER',status:['BUYABLE']}],attributes:amazonPayload(product).attributes,issues:[{severity:'ERROR'}]});
  const rejected=await applyAction(product,auth,'monitor',{channel:'amazon-us'});expect(rejected.product._catalog!.channels['amazon-us']!.submission).toMatchObject({status:'rejected',publication_status:'not_buyable'});expect(rejected.product._catalog!.channels['amazon-us']!.submission?.verified_content_hash).toBeUndefined();
 });
});
