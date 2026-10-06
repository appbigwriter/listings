import {describe,expect,it} from 'vitest';
import {buildEbayPackage} from '../lib/marketplaces/ebay-package';
import {createCatalog} from '../lib/catalog/model';
const product=()=>{
  const value={sku:'A',title:'Sign',description:'A <script>unsafe</script> & B\nNext',brand:'FBRSigns',gtin:'123456789012',id_type:'UPC',qty:'0',price:'12.50',images:['https://example.com/image.jpg'],pkg_length:10,pkg_width:8,pkg_height:2,pkg_weight:1,ebay_condition:'NEW',ebay_location:'warehouse',ebay_payment_policy:'1',ebay_return_policy:'2',ebay_fulfillment_policy:'3',_catalog:createCatalog({})};
  value._catalog.channels['ebay-us']={product_type:'SIGN',category:'123',attributes:{Material:['Aluminum']}};return value;
};
describe('eBay inventory and offer preparation',()=>{
  it('builds separate inventory/offer with explicit policies and safe plain-text content',()=>{
    const pack=buildEbayPackage(product());expect(pack.offer.listingPolicies).toEqual({paymentPolicyId:'1',returnPolicyId:'2',fulfillmentPolicyId:'3'});
    expect(pack.inventory.product.description).toContain('&lt;script&gt;');expect(pack.inventory.product.description).not.toContain('<script>');
    expect(pack.offer.includeCatalogProductDetails).toBe(false);expect(pack.offer.pricingSummary.price.value).toBe('12.50');expect(pack.publication).toBe('not_submitted');
  });
  it('requires marketplace configuration and keeps unsupported variation families blocked',()=>{
    expect(()=>buildEbayPackage({...product(),ebay_payment_policy:''})).toThrow('business policies');
    expect(()=>buildEbayPackage({...product(),relationship:'Child'})).toThrow('Inventory Item Group');
    expect(()=>buildEbayPackage({...product(),title:'A'.repeat(81)})).toThrow('80 caracteres');
  });
  it('does not reuse Amazon ASIN/exemption as an eBay identifier',()=>{
    expect(()=>buildEbayPackage({...product(),gtin:'',asin:'B012345678',gtin_exempt:true})).toThrow('ASIN');
    expect(buildEbayPackage({...product(),gtin:'',mpn:'FBR-123'}).inventory.product.mpn).toBe('FBR-123');
  });
});
