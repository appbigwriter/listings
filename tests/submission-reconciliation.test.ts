import {describe,expect,it} from 'vitest';
import {submissionMatches,amazonListingObservation} from '../lib/catalog/reconciliation';
describe('uncertain submission reconciliation',()=>{
  it('does not borrow buyability from another SKU/marketplace or release a blocking error as published',()=>{
    const payload={attributes:{brand:[{value:'FBRSigns'}]}},remote={sku:'SKU',attributes:payload.attributes,summaries:[{marketplaceId:'US',status:['DISCOVERABLE']},{marketplaceId:'CA',status:['BUYABLE']}]};
    expect(amazonListingObservation(payload,'SKU','US',remote)).toMatchObject({matched:true,buyable:false,status:'processing'});
    expect(amazonListingObservation(payload,'OTHER','US',remote)).toMatchObject({matched:false,verified:false,status:'unknown'});
    expect(amazonListingObservation(payload,'SKU','OTHER',remote)).toMatchObject({matched:false,verified:false});
    expect(amazonListingObservation(payload,'SKU','CA',{...remote,issues:[{severity:'ERROR'}]})).toMatchObject({matched:true,blocked:true,buyable:false,verified:false,status:'rejected'});
  });
  it('requires all posted attributes rather than title alone or a buyable status',()=>{
    const posted={attributes:{item_name:[{value:'Sign'}],brand:[{value:'FBRSigns'}]}};
    expect(submissionMatches(posted,{attributes:{item_name:[{value:'Sign'}],brand:[{value:'FBRSigns'}],extra:[{value:'remote'}]}})).toBe(true);
    expect(submissionMatches(posted,{attributes:{item_name:[{value:'Sign'}]}})).toBe(false);
    expect(submissionMatches(posted,{attributes:{...posted.attributes,brand:[{value:'Other'}]}})).toBe(false);
    expect(submissionMatches(null,{attributes:posted.attributes})).toBe(false);
  });
});
