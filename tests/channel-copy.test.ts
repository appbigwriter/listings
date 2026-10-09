import {beforeEach,describe,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({generate:vi.fn()}));
vi.mock('../lib/ai/generate',()=>({generateListing:mocks.generate}));
import {channelProduct,contentHash,createCatalog,type ProductInput} from '../lib/catalog/model';
import {validateChannelCopy} from '../lib/catalog/copy';
import {applyAction} from '../lib/catalog/actions';
import {amazonAttributes} from '../lib/marketplaces/amazon';
function fixture():ProductInput {
 const product:ProductInput={sku:'COPY',title:'Shared base title',description:'Steel base',material:'Steel',bullets:'Base bullet',keywords:'base'};
 product._catalog=createCatalog(product);product._catalog.channels['ebay-us']={product_type:'SIGN',category:'123',attributes:{}};return product;
}
const auth={userId:'owner',organizationId:'org',mode:'supabase-session' as const};
const copy={locale:'en_US' as const,title:'Amazon-specific title',description:'Steel sign',bullets:'Steel',keywords:'sign'};
beforeEach(()=>{vi.clearAllMocks();});
describe('independent marketplace content',()=>{
 it('preserves the legacy hash and text until a channel copy is explicitly saved',()=>{
  const product=fixture();expect(channelProduct(product,'amazon-us')).toBe(product);
  expect(amazonAttributes(product).item_name).toEqual([{value:'Shared base title',marketplace_id:'ATVPDKIKX0DER',language_tag:'en_US'}]);
 });
 it('changes only the selected channel content hash and derived publication attributes',async()=>{
  const product=fixture(),amazonHash=contentHash(product,'amazon-us'),ebayHash=contentHash(product,'ebay-us');
  const saved=(await applyAction(product,auth,'configure',{channel:'amazon-us',copy})).product;
  expect(saved.title).toBe(product.title);expect(contentHash(saved,'amazon-us')).not.toBe(amazonHash);expect(contentHash(saved,'ebay-us')).toBe(ebayHash);
  expect(amazonAttributes(saved).item_name).toEqual([{value:copy.title,marketplace_id:'ATVPDKIKX0DER',language_tag:'en_US'}]);
  expect(channelProduct(saved,'ebay-us').title).toBe('Shared base title');
 });
 it('rejects metadata injection, unsupported locales, empty titles and an oversized eBay title',()=>{
  expect(()=>validateChannelCopy({...copy,source:'ai'},'amazon-us')).toThrow('quatro campos');
  expect(()=>validateChannelCopy({...copy,locale:'pt_BR'},'amazon-us')).toThrow('en_US');
  expect(()=>validateChannelCopy({...copy,title:''},'amazon-us')).toThrow('obrigatório');
  expect(()=>validateChannelCopy({...copy,title:'x'.repeat(81)},'ebay-us')).toThrow('limite');
 });
 it('stores generated grounding in the selected channel and retains shared facts and other channel copy',async()=>{
  const product=fixture();product._catalog!.channels['amazon-us']!.copy={...copy,source:'human'};
  const previous=contentHash(product,'amazon-us');mocks.generate.mockResolvedValue({title:'eBay steel sign',description:'Steel',bullets:'Steel',keywords:'sign',grounding:{supported:true}});
  const saved=(await applyAction(product,auth,'generate',{channel:'ebay-us'})).product;
  expect(saved.title).toBe('Shared base title');expect(saved.material).toBe('Steel');expect(contentHash(saved,'amazon-us')).toBe(previous);
  expect(saved._catalog!.channels['ebay-us']!.copy).toMatchObject({title:'eBay steel sign',source:'ai',grounding:{supported:true}});
  expect(mocks.generate).toHaveBeenCalledWith(expect.objectContaining({fbrFacts:expect.objectContaining({title:'Shared base title',material:'Steel'})}),{}, {channel:'ebay-us',locale:'en_US'});
 });
 it('prepares an Amazon draft without calling Amazon catalog in sandbox',async()=>{
  const product=fixture();
  mocks.generate.mockResolvedValue({title:'LED Light Box',description:'Illuminated display',bullets:'Display',keywords:'light box',grounding:{supported:false,visual_observations:['Front panel visible']}});
  const result=await applyAction(product,auth,'prepare',{channel:'amazon-us'});
  expect(result.product._catalog!.channels['amazon-us']!.copy).toMatchObject({title:'LED Light Box',source:'ai'});
  expect(result.output).toMatchObject({classification:expect.anything()});
  expect(mocks.generate).toHaveBeenCalledTimes(1);
 });
});
