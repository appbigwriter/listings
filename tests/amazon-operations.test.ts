import { afterEach,describe,expect,it,vi } from 'vitest';
import { amazonDiscover,amazonFees,amazonRequest,retryAfterSeconds,amazonAttributes } from '../lib/marketplaces/amazon';
import { normalizeImportedProduct } from '../lib/catalog/import';
import { readJsonBody } from '../lib/http';
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
function configure() {
  vi.stubEnv('AMAZON_SP_API_CLIENT_ID',crypto.randomUUID());vi.stubEnv('AMAZON_SP_API_CLIENT_SECRET','fixture');vi.stubEnv('AMAZON_SP_API_REFRESH_TOKEN','fixture');vi.stubEnv('AMAZON_SP_API_SELLER_ID','FIXTURESELLER');
}
describe('Amazon read operations and transport',()=>{
  it('keeps missing or coerced stock out of attributes while retaining confirmed zero',()=>{
    for(const qty of [undefined,null,'',false,[],{},'0x10'])expect(amazonAttributes({sku:'A',fulfillment:'FBM',qty})).not.toHaveProperty('fulfillment_availability');
    expect(amazonAttributes({sku:'A',fulfillment:'FBM',qty:0}).fulfillment_availability).toEqual([{fulfillment_channel_code:'DEFAULT',quantity:0}]);
    expect(amazonAttributes({sku:'A',pkg_weight:true,pkg_length:true,pkg_width:true,pkg_height:true})).not.toHaveProperty('item_package_weight');
  });
  it('shares concurrent LWA refresh and retains sanitized actionable error codes',async()=>{
    configure();let lwa=0;
    vi.stubGlobal('fetch',vi.fn(async(input:string|URL)=>{if(String(input).includes('api.amazon.com')) {lwa++;await new Promise(resolve=>setTimeout(resolve,5));return Response.json({access_token:'fixture',expires_in:3600});}return Response.json({ok:true});}));
    await Promise.all([amazonRequest('/definitions/2020-09-01/productTypes'),amazonRequest('/catalog/2022-04-01/items')]);expect(lwa).toBe(1);
    configure();vi.stubGlobal('fetch',vi.fn(async()=>Response.json({error:'invalid_grant',error_description:'DO NOT LOG SECRET'},{status:400})));
    await expect(amazonRequest('/catalog/2022-04-01/items')).rejects.toThrow('invalid_grant');
  });
  it('uses exact identifiers for discovery and the SKU-specific fees endpoint',async()=>{
    configure();const urls:string[]=[];
    vi.stubGlobal('fetch',vi.fn(async(input:string|URL)=>{urls.push(String(input));return String(input).includes('api.amazon.com')?Response.json({access_token:'fixture',expires_in:3600}):Response.json({items:[]});}));
    await amazonDiscover({sku:'A',gtin:'123456789012',id_type:'UPC'});expect(urls[1]).toContain('identifiersType=UPC');expect(urls[1]).not.toContain('keywords=');
    await amazonFees({sku:'A/B',price:20,fulfillment:'FBM',shipping_charge:0});expect(urls[2]).toContain('/products/fees/v0/listings/A%2FB/feesEstimate');
    await expect(amazonDiscover({title:'Similar product'})).rejects.toThrow('GTIN ou ASIN');
  });
  it('promotes source parents without inventing variation themes',()=>{
    const parent=normalizeImportedProduct({sku:'P',name:'Sign',variants:[{sku:'C',color:'Blue'}]},'fixture');
    expect(parent.relationship).toBe('Parent');expect(parent.variation).toBeUndefined();expect(parent._catalog?.variants[0].sku).toBe('C');
    expect(normalizeImportedProduct({sku:'C',name:'Sign',parent_sku:'P'},'fixture').relationship).toBe('Child');
  });
  it('enforces streamed request bytes even without content-length',async()=>{
    await expect(readJsonBody(new Request('https://fbr.example',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({value:'x'.repeat(100)})}),40)).rejects.toMatchObject({status:413});
    expect(retryAfterSeconds('12')).toBe(12);
  });
});
