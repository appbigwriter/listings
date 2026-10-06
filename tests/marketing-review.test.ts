import {describe,it,expect} from 'vitest';
import {marketingSnapshot,sealMarketingApproval,marketingApprovalCurrent} from '../lib/marketing/review';
import {hash,contentHash} from '../lib/catalog/model';
import {calculateMargin} from '../lib/marketing/margin';
import {buildReadinessGate,validateAmazonDestination} from '../lib/marketing/validation';
import {buildIdempotencyKey} from '../lib/marketing/plans';
const auth={userId:'00000000-0000-4000-8000-000000000001',organizationId:'00000000-0000-4000-8000-000000000002',mode:'supabase-session' as const};
const listing={sku:'REVIEW',title:'Sign',payload:{price:20,qty:3,asin:'B012345678',images:['https://example.com/sign.jpg']}};
const profile={id:'profile',sku:'REVIEW',status:'draft',economics:{costs:{product_cost:5}}};
const snapshot=marketingSnapshot(listing,profile,{plan:{daily_budget_usd:10}},null,{destination_url:'https://www.amazon.com/dp/B012345678'});
const record={...auth,owner_id:auth.userId,organization_id:auth.organizationId,sku:'REVIEW',approver:auth.userId,decision:'approved',comments:'Reviewed',created_at:'2026-10-05T12:00:00.000Z'};
const costs={product_cost:5,printing_cost:0,packaging_cost:0,shipping_cost:0,amazon_referral_fee:3,fulfillment_fee:0,other_costs:0,currency:'USD' as const};
describe('marketing version review',()=>{
 it('binds Amazon US destinations to the actual SKU identity',()=>{
  for(const url of ['https://www.amazon.com/','http://www.amazon.com/dp/B012345678','https://user@www.amazon.com/dp/B012345678','https://amazon.com.attacker.com/dp/B012345678','https://www.amazon.ca/dp/B012345678'])expect(validateAmazonDestination(listing.payload,url)).toEqual(['amazon_destination_invalid']);
  expect(validateAmazonDestination(listing.payload,'https://www.amazon.com/dp/B099999999')).toEqual(['amazon_destination_mismatch']);
  expect(validateAmazonDestination(listing.payload,'https://www.amazon.com/dp/B012345678?tag=tracking')).toEqual([]);
 });
 it('invalidates decisions when catalog, economics, campaign or tracking changes',()=>{
  const original=hash(snapshot),signed=sealMarketingApproval(record,original);
  expect(marketingApprovalCurrent(signed,original,auth)).toBe(true);
  const variants=[marketingSnapshot({...listing,payload:{...listing.payload,price:30}},profile,{plan:{daily_budget_usd:10}},null,{destination_url:'https://www.amazon.com/dp/B012345678'}),{...snapshot,profile:{...snapshot.profile,economics:{costs:{product_cost:6}}}},{...snapshot,amazon_plan:{daily_budget_usd:11}},{...snapshot,tracking:{destination_url:'https://www.amazon.com/dp/B099999999'}}];
  for(const changed of variants)expect(marketingApprovalCurrent(signed,hash(changed),auth)).toBe(false);
 });
 it('preserves proof across database timestamp formatting but rejects forgery and cross-owner replay',()=>{
  const version=hash(snapshot),signed=sealMarketingApproval(record,version);
  expect(marketingApprovalCurrent({...signed,created_at:'2026-10-05T12:00:00+00:00'},version,auth)).toBe(true);
  expect(marketingApprovalCurrent({...signed,comments:'Different decision'},version,auth)).toBe(false);
  expect(marketingApprovalCurrent({...signed,signature:undefined},version,auth)).toBe(false);
  expect(marketingApprovalCurrent({...signed,decision:'rejected'},version,auth)).toBe(false);
  expect(marketingApprovalCurrent(signed,version,{...auth,userId:auth.organizationId})).toBe(false);
 });
 it('ignores workflow status and timestamps while keeping versioned Kanban work separate',()=>{
  expect(marketingSnapshot(listing,{...profile,status:'launch_ready',updated_at:'later',approval_notes:'decision'}, {plan:{daily_budget_usd:10}},null,{destination_url:'https://www.amazon.com/dp/B012345678'})).toEqual(snapshot);
  expect(buildIdempotencyKey('REVIEW',auth.organizationId,hash(snapshot))).not.toBe(buildIdempotencyKey('REVIEW',auth.organizationId,hash({...snapshot,meta_plan:{budget:1}})));
 });
 it('blocks stale price, non-USD/overflow costs and invalid margin dates',()=>{
  const margin=calculateMargin(20,costs);
  expect(buildReadinessGate({...listing.payload,price:30},margin).blockers).toContain('margin_price_changed');
  expect(buildReadinessGate(listing.payload,{...margin,calculated_at:'invalid'}).blockers).toContain('margin_date_invalid');
  expect(()=>calculateMargin(20,{...costs,currency:'BRL' as any})).toThrow();
  expect(()=>calculateMargin(20,{...costs,currency:undefined})).toThrow();
  expect(()=>calculateMargin(Number.MAX_VALUE,costs)).toThrow();
 });
 it('keeps listing approval stable when read-only provider observations refresh',()=>{
  const product={sku:'REVIEW',title:'Sign',material:'Steel'};
  expect(contentHash({...product,amazon_fees:{price:20},amazon_discovery:{checked_at:'later'},amazon_restrictions:{result:[]},ai_grounding:{}})).toBe(contentHash(product));
 });
});
