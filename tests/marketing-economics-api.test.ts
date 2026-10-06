import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {NextRequest} from 'next/server';
const mocks=vi.hoisted(()=>({auth:vi.fn(),db:vi.fn(),context:vi.fn()}));
vi.mock('../lib/auth',async original=>({...await original<any>(),resolveAuthContext:mocks.auth}));
vi.mock('../lib/marketing/supabase',()=>({getSupabase:mocks.db}));
vi.mock('../lib/marketing/profile-guard',()=>({getMarketingProfileContext:mocks.context}));
vi.mock('../lib/marketplaces/amazon',()=>({amazonConfig:()=>({sellerId:'SELLER',marketplaceId:'ATVPDKIKX0DER'})}));
import {GET} from '../app/api/marketing-economics/route';
import {amazonFeeTarget,normalizeAmazonFeeEstimate} from '../lib/marketplaces/amazon-fee-estimates';
const auth={userId:'owner',organizationId:'org',roles:['operator'],mode:'supabase-session'},now=Date.parse('2026-10-06T02:00:00Z');
function context(){
 const product={sku:'FBR-FEE',title:'Sign',price:20,shipping_charge:0,fulfillment:'FBM'},target=amazonFeeTarget(product,{sellerId:'SELLER',marketplaceId:'ATVPDKIKX0DER'});
 const receipt=normalizeAmazonFeeEstimate({payload:{FeesEstimateResult:{Status:'Success',FeesEstimateIdentifier:{MarketplaceId:target.marketplace_id,SellerId:target.seller_id,IdType:target.id_type,IdValue:target.id_value,SellerInputIdentifier:target.request_identifier,IsAmazonFulfilled:false,PriceToEstimateFees:{ListingPrice:{CurrencyCode:'USD',Amount:20}}},FeesEstimate:{TimeOfFeesEstimation:new Date(now).toISOString(),TotalFeesEstimate:{CurrencyCode:'USD',Amount:3}}}}},target,now);
 return {listing:{sku:product.sku,title:product.title,payload:{...product,amazon_fees:receipt},updated_at:new Date(now).toISOString()},profile:{economics:{costs:{product_cost:5,printing_cost:0,packaging_cost:1,shipping_cost:3,other_costs:0,currency:'USD',source:'Cost worksheet',calculated_at:new Date(now).toISOString()}}},archived:false,error:null};
}
const request=()=>new NextRequest('http://localhost/api/marketing-economics?sku=FBR-FEE');
beforeEach(()=>{vi.resetAllMocks();vi.useFakeTimers();vi.setSystemTime(now);mocks.auth.mockResolvedValue(auth);mocks.db.mockReturnValue({readOnly:true});mocks.context.mockResolvedValue(context());});
afterEach(()=>vi.useRealTimers());
describe('read-only owner-scoped fee economics API',()=>{
 it('authenticates before database access and scopes lookup to the verified actor',async()=>{
  mocks.auth.mockResolvedValue(null);expect((await GET(request())).status).toBe(401);expect(mocks.db).not.toHaveBeenCalled();
  mocks.auth.mockResolvedValue(auth);const response=await GET(request());expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('private, no-store');expect(mocks.context).toHaveBeenCalledWith({readOnly:true},auth,'FBR-FEE');
  expect((await response.json()).data).toMatchObject({estimated_margin:{profit:8,total_cost:12,basis:'amazon_api_estimate'},applied_to_profile:false});
 });
 it('keeps missing operating costs unresolved and rejects obsolete fee targets',async()=>{
  const missing=context();delete (missing.profile.economics.costs as any).shipping_cost;mocks.context.mockResolvedValue(missing);
  const response=await GET(request());expect(response.status).toBe(200);expect((await response.json()).data).toMatchObject({estimated_margin:null,blockers:[expect.stringContaining('shipping_cost')],applied_to_profile:false});
  const changed=context();changed.listing.payload.price=21;mocks.context.mockResolvedValue(changed);expect((await GET(request())).status).toBe(409);
 });
 it('does not expose archived or missing listings',async()=>{
  mocks.context.mockResolvedValue({...context(),archived:true});expect((await GET(request())).status).toBe(404);
  mocks.context.mockResolvedValue({listing:null,profile:null,error:null,archived:false});expect((await GET(request())).status).toBe(404);
 });
});
