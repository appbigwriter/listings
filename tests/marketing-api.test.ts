import {beforeEach,describe,expect,it,vi} from 'vitest';
import {NextRequest} from 'next/server';
const mocks=vi.hoisted(()=>({auth:vi.fn(),db:vi.fn(),review:vi.fn(),context:vi.fn(),rpc:vi.fn(),upsert:vi.fn()}));
vi.mock('../lib/auth',async original=>({...await original<any>(),resolveAuthContext:mocks.auth}));
vi.mock('../lib/marketing/supabase',()=>({getSupabase:mocks.db}));
vi.mock('../lib/marketing/review',async original=>({...await original<any>(),loadMarketingReview:mocks.review}));
vi.mock('../lib/marketing/profile-guard',async original=>({...await original<any>(),getMarketingProfileContext:mocks.context}));
import {POST as approve} from '../app/api/marketing-approvals/route';
import {POST as saveProfile} from '../app/api/marketing-profiles/route';
const auth={userId:'00000000-0000-4000-8000-000000000001',organizationId:'00000000-0000-4000-8000-000000000002',mode:'supabase-session',roles:['admin']};
const costs={product_cost:5,printing_cost:0,packaging_cost:0,shipping_cost:0,amazon_referral_fee:3,fulfillment_fee:0,other_costs:0,currency:'USD'};
const request=(body:unknown)=>new NextRequest('http://localhost/api/marketing-approvals',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
const body={sku:'FBR-SKU',decision:'approved',comments:'Reviewed',expected_hash:'a'.repeat(64)};
beforeEach(()=>{
 vi.resetAllMocks();mocks.auth.mockResolvedValue(auth);mocks.rpc.mockResolvedValue({data:'decision-id',error:null});
 mocks.db.mockReturnValue({rpc:mocks.rpc,from:()=>({update:mocks.upsert,insert:mocks.upsert})});
 mocks.upsert.mockImplementation(row=>{const query:any={eq:()=>query,select:()=>({maybeSingle:async()=>({data:row,error:null})})};return query;});
 mocks.review.mockResolvedValue({content_hash:body.expected_hash,gate:{ready:true,blockers:[]},profile:{id:'profile'},snapshot:{product:{sku:'FBR-SKU'}},versions:{listing:'2026-10-05T00:00:00Z',profile:'2026-10-05T00:00:00Z'}});
 mocks.context.mockResolvedValue({listing:{id:'listing',sku:'FBR-SKU',title:'Actual sign',payload:{price:20,qty:3,asin:'B012345678',images:['https://example.com/sign.jpg']}},profile:{id:'profile'},error:null,archived:false});
});
describe('marketing HTTP guards',()=>{
 it('rejects stale reviews before any decision write',async()=>{
  const result=await approve(request({...body,expected_hash:'b'.repeat(64)}));expect(result.status).toBe(409);expect(mocks.rpc).not.toHaveBeenCalled();
 });
 it('binds server actor, signature and snapshot to one transactional write',async()=>{
  const result=await approve(request({...body,approver:'someone-else',signature:'forged',content_hash:'forged'}));
  expect(result.status).toBe(201);expect(mocks.rpc).toHaveBeenCalledTimes(1);
  const args=mocks.rpc.mock.calls[0][1];expect(args.p_record).toMatchObject({approver:auth.userId,owner_id:auth.userId,content_hash:body.expected_hash});expect(args.p_record.signature).toMatch(/^[a-f0-9]{64}$/);expect(args.p_snapshot.product.sku).toBe('FBR-SKU');
 });
 it('blocks operator approvals and failed readiness without mutations',async()=>{
  mocks.auth.mockResolvedValue({...auth,roles:['operator']});expect((await approve(request(body))).status).toBe(403);expect(mocks.rpc).not.toHaveBeenCalled();
  mocks.auth.mockResolvedValue(auth);mocks.review.mockResolvedValue({...await mocks.review(),gate:{ready:false,blockers:['margin_price_changed']}});
  expect((await approve(request(body))).status).toBe(400);expect(mocks.rpc).not.toHaveBeenCalled();
 });
 it('reports a transaction conflict without replaying the decision',async()=>{
  mocks.rpc.mockResolvedValue({error:{message:'Version changed'}});expect((await approve(request(body))).status).toBe(409);expect(mocks.rpc).toHaveBeenCalledTimes(1);
 });
 it('uses the catalog price and stock instead of submitted product overrides',async()=>{
  const result=await saveProfile(request({sku:'FBR-SKU',price:999,qty:999,title:'Forged',costs}));expect(result.status).toBe(201);expect((await result.json()).data.economics.margin.revenue).toBe(20);
  mocks.context.mockResolvedValue({...await mocks.context(),listing:{id:'listing',sku:'FBR-SKU',title:'Sign',payload:{price:20,qty:0,asin:'B012345678',images:['https://example.com/sign.jpg']}}});
  expect((await saveProfile(request({sku:'FBR-SKU',qty:999,costs}))).status).toBe(400);
 });
 it('does not reuse an existing approval while saving edited economics',async()=>{
  expect((await saveProfile(request({sku:'FBR-SKU',status:'launch_ready',costs}))).status).toBe(400);expect(mocks.upsert).not.toHaveBeenCalled();
 });
});
