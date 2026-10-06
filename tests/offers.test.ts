import {describe,expect,it} from 'vitest';
import {offerPatch} from '../lib/catalog/offers';
describe('granular offer updates',()=>{
  const product={sku:'A',price:'12.50',qty:'0',fulfillment:'FBM'};
  it('changes only selected attributes using merge and explicit selectors',()=>{
    const patch=offerPatch(product,['price','qty'],'prelisting');
    expect(patch.payload.patches.map(item=>item.path)).toEqual(['/attributes/purchasable_offer','/attributes/fulfillment_availability']);
    expect(patch.payload.patches.every(item=>item.op==='merge')).toBe(true);
    expect(patch.attributes.fulfillment_availability).toEqual([{fulfillment_channel_code:'DEFAULT',quantity:0}]);
    expect(patch.payload).not.toHaveProperty('attributes.item_name');
  });
  it('rejects unconfirmed authority, FBA stock and parent offers',()=>{
    expect(()=>offerPatch(product,['price'],'amazon')).toThrow('fonte autorizada');
    expect(()=>offerPatch({...product,fulfillment:'FBA'},['qty'],'prelisting')).toThrow('FBA');
    expect(()=>offerPatch({...product,relationship:'Parent'},['price'],'prelisting')).toThrow('pai');
  });
  it('rejects missing/fractional stock, imprecise price and arbitrary fields',()=>{
    for(const qty of ['',undefined,'-1','1.5',false,[],{},'0x10',' '])expect(()=>offerPatch({...product,qty},['qty'],'prelisting')).toThrow('inteiro');
    expect(()=>offerPatch({...product,price:1.234},['price'],'prelisting')).toThrow('casas decimais');
    expect(()=>offerPatch(product,['description'],'prelisting')).toThrow('preço');
  });
});
