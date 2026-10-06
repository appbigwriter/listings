import {describe,it,expect,vi,afterEach} from 'vitest';
import {amazonFeeTarget,normalizeAmazonFeeEstimate,currentAmazonFeeEstimate} from '../lib/marketplaces/amazon-fee-estimates';
import {estimatedAmazonMargin} from '../lib/marketing/fee-economics';
const now=Date.parse('2026-10-06T02:00:00Z'),config={sellerId:'SELLER',marketplaceId:'ATVPDKIKX0DER'};
const product={sku:'FBR-FEES',asin:'B012345678',price:20,shipping_charge:5,fulfillment:'FBM'};
function reply(overrides:any={}){const target=amazonFeeTarget(product,config);return {payload:{FeesEstimateResult:{Status:'Success',FeesEstimateIdentifier:{MarketplaceId:target.marketplace_id,SellerId:target.seller_id,IdType:target.id_type,IdValue:target.id_value,SellerInputIdentifier:target.request_identifier,IsAmazonFulfilled:false,PriceToEstimateFees:{ListingPrice:{CurrencyCode:'USD',Amount:20},Shipping:{CurrencyCode:'USD',Amount:5}}},FeesEstimate:{TimeOfFeesEstimation:new Date(now).toISOString(),TotalFeesEstimate:{CurrencyCode:'USD',Amount:4},FeeDetailList:[{FeeType:'ReferralFee',FeeAmount:{CurrencyCode:'USD',Amount:4},FinalFee:{CurrencyCode:'USD',Amount:4}}]},...overrides}}};}
afterEach(()=>{vi.useRealTimers();});
describe('Amazon fee receipt and economics projection',()=>{
 it('requires confirmed customer shipping rather than assuming zero and uses SellerSKU for unlinked products',()=>{
  expect(()=>amazonFeeTarget({...product,shipping_charge:undefined},config)).toThrow('inclusive zero confirmado');
  for(const shipping_charge of [false,[],{},'0x10',' '])expect(()=>amazonFeeTarget({...product,shipping_charge},config)).toThrow('zero confirmado');
  expect(()=>amazonFeeTarget({...product,currency:'EUR'},config)).toThrow('USD');
  expect(amazonFeeTarget({...product,asin:'',shipping_charge:0},config)).toMatchObject({id_type:'SellerSKU',id_value:product.sku,shipping_charge:0});
 });
 it('rejects failed estimates and wrong seller, identity, price, shipping or fulfillment',()=>{
  const target=amazonFeeTarget(product,config);expect(()=>normalizeAmazonFeeEstimate(reply({Status:'ClientError'}),target,now)).toThrow('bem-sucedida');
  for(const change of [{SellerId:'OTHER'},{IdValue:'B099999999'},{MarketplaceId:'OTHER'},{IsAmazonFulfilled:true},{SellerInputIdentifier:'old'}]){const response=reply();Object.assign(response.payload.FeesEstimateResult.FeesEstimateIdentifier,change);expect(()=>normalizeAmazonFeeEstimate(response,target,now)).toThrow('não corresponde');}
  const response=reply();response.payload.FeesEstimateResult.FeesEstimateIdentifier.PriceToEstimateFees.Shipping.Amount=0;expect(()=>normalizeAmazonFeeEstimate(response,target,now)).toThrow('frete');
 });
 it('rejects a stale receipt, changed account/product target and tampered total',()=>{
  const snapshot=normalizeAmazonFeeEstimate(reply(),amazonFeeTarget(product,config),now),saved={...product,amazon_fees:snapshot};
  expect(currentAmazonFeeEstimate(saved,config,now)).toEqual(snapshot);
  expect(()=>currentAmazonFeeEstimate(saved,config,now+86400001)).toThrow('vencida');
  expect(()=>currentAmazonFeeEstimate({...saved,price:21},config,now)).toThrow('mudou');
  expect(()=>currentAmazonFeeEstimate(saved,{...config,sellerId:'OTHER'},now)).toThrow('mudou');
  expect(()=>currentAmazonFeeEstimate({...saved,amazon_fees:{...snapshot,total_fees:0}},config,now)).toThrow('mudou');
 });
 it('uses the aggregate once without double-counting included FBA detail or manual Amazon fees',()=>{
  vi.useFakeTimers();vi.setSystemTime(now);
  const response=reply();response.payload.FeesEstimateResult.FeesEstimate.FeeDetailList=[{FeeType:'FBAFees',FeeAmount:{CurrencyCode:'USD',Amount:4},FinalFee:{CurrencyCode:'USD',Amount:4},IncludedFeeDetailList:[{FeeType:'FBAPickAndPack',FeeAmount:{CurrencyCode:'USD',Amount:4},FinalFee:{CurrencyCode:'USD',Amount:4}}]}];
  const fbaTarget=amazonFeeTarget({...product,fulfillment:'FBA'},config);Object.assign(response.payload.FeesEstimateResult.FeesEstimateIdentifier,{IsAmazonFulfilled:true,SellerInputIdentifier:fbaTarget.request_identifier});
  const estimate=normalizeAmazonFeeEstimate(response,fbaTarget,now);
  const costs={product_cost:5,printing_cost:1,packaging_cost:1,shipping_cost:3,other_costs:0,amazon_referral_fee:999,fulfillment_fee:999,currency:'USD',source:'Verified unit-cost worksheet',calculated_at:new Date(now).toISOString()};
  expect(estimatedAmazonMargin(costs,estimate)).toMatchObject({basis:'amazon_api_estimate',revenue:25,total_cost:14,profit:11,amazon_fees_total:4,business_cost_total:10});expect(costs.amazon_referral_fee).toBe(999);
  expect(()=>estimatedAmazonMargin({...costs,shipping_cost:undefined},estimate)).toThrow('shipping_cost');
 });
 it('requires numeric USD amounts and valid dates while retaining optional tax as unknown',()=>{
  const target=amazonFeeTarget(product,config),response=reply();response.payload.FeesEstimateResult.FeesEstimate.TotalFeesEstimate.CurrencyCode='EUR';expect(()=>normalizeAmazonFeeEstimate(response,target,now)).toThrow('moeda');
  expect(()=>normalizeAmazonFeeEstimate(reply({FeesEstimate:{TimeOfFeesEstimation:'invalid'}}),target,now)).toThrow('Data');
  expect(normalizeAmazonFeeEstimate(reply(),target,now).details[0].tax_amount).toBeNull();
 });
});
