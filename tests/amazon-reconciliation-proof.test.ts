import {beforeEach,describe,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({load:vi.fn(),persist:vi.fn(),readback:vi.fn()}));
vi.mock('../lib/catalog/repository',async original=>({...await original<any>(),loadProduct:mocks.load,persistProduct:mocks.persist}));
vi.mock('../lib/catalog/readiness',()=>({evaluateReadiness:()=>({ready:true,issues:[]})}));
vi.mock('../lib/marketplaces/amazon',()=>({amazonConfig:()=>({sellerId:'SELLER',marketplaceId:'US'}),amazonPayload:()=>({attributes:{item_name:[{value:'Sign'}]}}),amazonReadback:mocks.readback}));
import {executeAction} from '../lib/catalog/executor';
import {createCatalog} from '../lib/catalog/model';
const auth={userId:'owner',organizationId:'org',mode:'supabase-session' as const,roles:['admin' as const]};
const product={sku:'SKU',title:'Sign',_catalog:createCatalog({sku:'SKU'})};
const claim={id:'claim',sku:'SKU',status:'unknown',created_at:'2026-10-05T00:00:00Z',target:{seller_id:'SELLER',marketplace_id:'US'},request_hash:'previous-version',request_payload:{attributes:{item_name:[{value:'Sign'}]}}};
function database(){const writes:any[]=[];return {writes,db:{from:()=>{
 let updating=false;const query:any={eq:()=>query,in:()=>query,order:()=>query,limit:()=>query,select:()=>query,update:(body:any)=>{updating=true;writes.push(body);return query;},maybeSingle:async()=>({data:updating?{id:claim.id}:claim,error:null})};return query;
}}};}
beforeEach(()=>{vi.resetAllMocks();mocks.load.mockResolvedValue({product:structuredClone(product),row:{updated_at:'current-version'}});mocks.persist.mockResolvedValue({id:'product'});});
describe('uncertain ledger reconciliation proof',()=>{
 it('keeps uncertainty untouched when a readback belongs to another SKU or marketplace',async()=>{
  for(const remote of [{sku:'OTHER',summaries:[{marketplaceId:'US',status:['BUYABLE']}]},{sku:'SKU',summaries:[{marketplaceId:'CA',status:['BUYABLE']}]}]){
   const {db,writes}=database();mocks.readback.mockResolvedValue({...remote,attributes:claim.request_payload.attributes});
   expect((await executeAction(db as any,auth,'SKU','reconcile')).output).toMatchObject({matched:false});expect(writes).toHaveLength(0);expect(mocks.persist).not.toHaveBeenCalled();
  }
 });
 it('never upgrades a blocking ERROR to published even if BUYABLE and attributes appear together',async()=>{
  const {db,writes}=database();mocks.readback.mockResolvedValue({sku:'SKU',summaries:[{marketplaceId:'US',status:['BUYABLE']}],attributes:claim.request_payload.attributes,issues:[{severity:'ERROR',code:'SUPPRESSED'}]});
  expect((await executeAction(db as any,auth,'SKU','reconcile')).output).toMatchObject({matched:true,status:'rejected'});expect(writes[0].status).toBe('rejected');
  const saved=mocks.persist.mock.calls[0][2]._catalog.channels['amazon-us'].submission;expect(saved.publication_status).toBe('not_buyable');expect(saved.verified_content_hash).toBeUndefined();
 });
});
