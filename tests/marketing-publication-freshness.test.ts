import {afterEach,describe,expect,it,vi} from 'vitest';
vi.mock('../lib/catalog/readiness',()=>({evaluateReadiness:()=>({ready:true,issues:[]})}));
import {loadMarketingReview,marketingSnapshot} from '../lib/marketing/review';
import {createCatalog,contentHash} from '../lib/catalog/model';
import {productFromRow} from '../lib/catalog/repository';
import {calculateMargin} from '../lib/marketing/margin';
const now=Date.parse('2026-10-06T11:00:00Z');
const auth={userId:'00000000-0000-4000-8000-000000000001',organizationId:'00000000-0000-4000-8000-000000000002',mode:'supabase-session' as const};
function fixture(){
 const listing={sku:'FRESH',title:'Sign',payload:{price:20,qty:3,asin:'B012345678',images:['https://example.com/sign.jpg'],_catalog:createCatalog({sku:'FRESH'})}};
 const submission={status:'published' as const,publication_status:'buyable' as const,request_hash:'request',submitted_at:new Date(now).toISOString(),verified_at:new Date(now).toISOString(),verified_content_hash:contentHash(productFromRow(listing))};
 listing.payload._catalog.channels['amazon-us']!.submission=submission;
 const costs={product_cost:5,printing_cost:0,packaging_cost:0,shipping_cost:0,amazon_referral_fee:3,fulfillment_fee:0,other_costs:0,currency:'USD' as const,source:'Confirmed test costs',calculated_at:new Date(now).toISOString()};
 const profile={sku:listing.sku,economics:{costs,margin:calculateMargin(20,costs)}};
 const context={listing,profile,latestApproval:null,archived:false,error:null};
 const db={from:()=>{const query:any={select:()=>query,eq:()=>query,maybeSingle:async()=>({data:null,error:null})};return query;}};
 return {listing,submission,profile,context,db};
}
afterEach(()=>vi.useRealTimers());
describe('marketing current publication proof',()=>{
 it('requires reconciliation when buyability evidence is absent, invalid, expired or too far in the future',async()=>{
  vi.useFakeTimers();vi.setSystemTime(now);
  const {submission,context,db}=fixture();
  expect((await loadMarketingReview(db,auth,'FRESH',context)).gate.blockers).not.toContain('listing_not_verified_buyable');
  for(const value of ['', 'invalid',new Date(now-86400001).toISOString(),new Date(now+300001).toISOString()]){
   submission.verified_at=value;
   expect((await loadMarketingReview(db,auth,'FRESH',context)).gate.blockers).toContain('listing_not_verified_buyable');
  }
 });
 it('keeps approval content stable during proof refresh but rejects changed content and rejected submissions',async()=>{
  vi.useFakeTimers();vi.setSystemTime(now);
  const {listing,submission,profile,context,db}=fixture(),snapshot=marketingSnapshot(listing,profile,null,null,null);
  submission.verified_at=new Date(now-1000).toISOString();
  expect(marketingSnapshot(listing,profile,null,null,null)).toEqual(snapshot);
  listing.title='Changed';
  expect((await loadMarketingReview(db,auth,'FRESH',context)).gate.blockers).toContain('listing_not_verified_buyable');
  submission.verified_content_hash=contentHash(productFromRow(listing));
  (submission as any).status='rejected';
  expect((await loadMarketingReview(db,auth,'FRESH',context)).gate.blockers).toContain('listing_not_verified_buyable');
 });
});
