import {afterEach,describe,expect,it,vi} from 'vitest';
import {buildWalmartPackage} from '../lib/marketplaces/walmart-package';
import {buildWalmartFeed,interpretWalmartFeedPage} from '../lib/marketplaces/walmart-feed';
import {createCatalog,hash,type ProductInput} from '../lib/catalog/model';
import {walmartRequest} from '../lib/marketplaces/walmart';
function fixture(sku='WM-1'):ProductInput {
 const product={sku,title:'Sign',price:20,currency:'USD',gtin:'00012345678905',_catalog:createCatalog({sku})};
 product._catalog.facts.gtin={value:product.gtin,status:'confirmed',source:'synthetic test fixture',observed_at:new Date().toISOString()};
 const schema={type:'object',required:['MPItemFeedHeader','MPItem'],properties:{MPItemFeedHeader:{type:'object',properties:{version:{const:'5.0'}}},MPItem:{type:'array',minItems:1,items:{type:'object',required:['Orderable','Visible']}}}};
 product._catalog.channels['walmart-us']={category:'Signs',product_type:'Signs',schema:{channel:'walmart-us',category:'Signs',product_type:'Signs',schema,version:'5.0.dated-spec',checksum:hash(schema),fetched_at:new Date().toISOString()},attributes:{MPItemFeedHeader:{feedType:'MP_ITEM',sellingChannel:'marketplace',processMode:'REPLACE',version:'5.0'},Orderable:{sku,specProductType:'Signs',price:20,productIdentifiers:{productIdType:'GTIN',productId:product.gtin}},Visible:{Signs:{productName:'Sign'}}}};
 return product;
}
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
describe('Walmart full spec preparation and ingestion truth',()=>{
 it('builds full spec-validated envelope with separate orderable and visible and rejects catalog/identity conflicts',()=>{
  const product=fixture();expect(buildWalmartPackage(product).MPItem[0].Orderable.sku).toBe(product.sku);
  for(const patch of [{price:true},{currency:'BRL'},{gtin:'99999999999999'},{relationship:'Child'}])expect(()=>buildWalmartPackage({...product,...patch})).toThrow();
  product._catalog!.channels['walmart-us']!.schema!.schema={type:'object',properties:{material:{type:'string'}}};product._catalog!.channels['walmart-us']!.schema!.checksum=hash(product._catalog!.channels['walmart-us']!.schema!.schema);
  expect(()=>buildWalmartPackage(product)).toThrow('Get Spec completa');
 });
 it('rejects header versions against official full schema and mixed or duplicated feeds',()=>{
  const product=fixture(),listing=product._catalog!.channels['walmart-us']!;
  (listing.attributes.MPItemFeedHeader as any).version='wrong';expect(()=>buildWalmartPackage(product)).toThrow('incompatível');
  expect(()=>buildWalmartFeed([fixture(),fixture()])).toThrow();expect(buildWalmartFeed([fixture(),fixture('WM-2')]).MPItem).toHaveLength(2);
 });
 it('keeps ingested items as accepted and unfinished review as processing even for PROCESSED feeds',()=>{
  const response={feedId:'F@US',feedStatus:'PROCESSED',itemsReceived:2,offset:0,limit:50,itemDetails:{itemIngestionStatus:[{sku:'WM-1',ingestionStatus:'SUCCESS',itemid:'1'},{sku:'WM-2',ingestionStatus:'INPROGRESS',pendingStatusDescription:'Manual review'}]}};
  expect(interpretWalmartFeedPage(response,'F@US',['WM-1','WM-2'])).toMatchObject({complete:true,requires_item_readback:true,outcomes:[{status:'accepted',publication_status:'not_verified'},{status:'processing',pending_review:true}]});
  expect(()=>interpretWalmartFeedPage(response,'other',['WM-1','WM-2'])).toThrow();
  response.itemDetails.itemIngestionStatus[1].sku='WM-1';expect(()=>interpretWalmartFeedPage(response,'F@US',['WM-1','WM-2'])).toThrow();
 });
 it('blocks foreign endpoints and external writes during recovery before network access',async()=>{
  const fetch=vi.fn();vi.stubGlobal('fetch',fetch);vi.stubEnv('PRELISTING_RECOVERY_MODE','true');
  await expect(walmartRequest('//evil.com/v3/items')).rejects.toThrow('Caminho');
  await expect(walmartRequest('/v3/feeds','POST',{})).rejects.toMatchObject({status:503});expect(fetch).not.toHaveBeenCalled();
 });
});
