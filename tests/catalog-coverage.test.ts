import {beforeEach,describe,it,expect,vi} from 'vitest';
import {NextRequest} from 'next/server';
const mocks=vi.hoisted(()=>({auth:vi.fn(),db:vi.fn()}));
vi.mock('../lib/auth',async original=>({...await original<any>(),resolveAuthContext:mocks.auth}));
vi.mock('../lib/marketing/supabase',()=>({getSupabase:mocks.db}));
import {GET} from '../app/api/catalog/coverage/route';
import {coverageItem} from '../lib/catalog/coverage';
import {createCatalog,contentHash} from '../lib/catalog/model';
import {productFromRow} from '../lib/catalog/repository';
const auth={userId:'owner',organizationId:'org',mode:'supabase-session',roles:['operator']},now=Date.parse('2026-10-06T02:40:00Z');
function row(){return {sku:'COVER-001',title:'Sign',brand:'FBR',owner_id:auth.userId,updated_at:new Date(now).toISOString(),status:'draft',payload:{sku:'COVER-001',title:'Sign',_catalog:createCatalog({sku:'COVER-001'})}};}
function database(rows:any[],count=rows.length,uncertain:string[]=[]){
 const calls:any[]=[],db={from:(table:string)=>{
  const query:any={select:()=>query,eq:(...args:any[])=>{calls.push([table,...args]);return query;},in:()=>query,order:()=>query,range:async()=>({data:rows,count,error:null}),then:(resolve:any)=>Promise.resolve({data:uncertain.map(sku=>({sku})),error:null}).then(resolve)};return query;
 }};return {db,calls};
}
beforeEach(()=>{vi.resetAllMocks();mocks.auth.mockResolvedValue(auth);});
describe('scoped coverage and external verification truth',()=>{
 it('uses the eBay publication proof instead of claiming Amazon buyability in that channel',()=>{
  const product=row();product.payload._catalog.channels['ebay-us']={product_type:'SIGN',category:'123',attributes:{}};
  product.payload._catalog.channels['ebay-us']!.submission={status:'published',request_hash:'published-version',submitted_at:new Date(now).toISOString(),publication_status:'published_verified',verified_content_hash:contentHash(productFromRow(product),'ebay-us'),verified_at:new Date(now).toISOString()};
  expect(coverageItem(product,'ebay-us',false,now)).toMatchObject({external:'verified_published',external_version_verified:true});
  expect(coverageItem(product,'ebay-us',false,now+86400001).external).toBe('published_requires_reconciliation');
 });
 it('does not turn accepted or expired/mismatched publication observations into verified buyability',()=>{
  const product=row(),listing=product.payload._catalog.channels['amazon-us']!;
  listing.submission={status:'accepted',request_hash:'old',submitted_at:new Date(now).toISOString(),publication_status:'not_verified'};
  expect(coverageItem(product,'amazon-us',false,now).external).toBe('accepted');
  Object.assign(listing.submission,{status:'published',publication_status:'buyable',verified_content_hash:contentHash(productFromRow(product)),verified_at:new Date(now).toISOString()});
  expect(coverageItem(product,'amazon-us',false,now)).toMatchObject({external:'verified_buyable',external_version_verified:true});
  expect(coverageItem(product,'amazon-us',false,now+86400001).external).toBe('published_requires_reconciliation');
  product.title='Changed title';expect(coverageItem(product,'amazon-us',false,now).external).toBe('published_requires_reconciliation');
  expect(coverageItem(product,'amazon-us',true,now)).toMatchObject({external:'uncertain',external_version_verified:false,next_action:'investigate_submission_before_retry'});
 });
 it('keeps exclusions pending until confirmed, accounts for archives and never hides source conflicts',()=>{
  const product=row();product.payload._catalog.kind='service';
  expect(coverageItem(product,'amazon-us',false,now).preparation).toBe('service_exclusion_pending');
  product.payload._catalog.eligibility_confirmed=true;expect(coverageItem(product,'amazon-us',false,now).preparation).toBe('excluded_service');
  product.status='archived';expect(coverageItem(product,'amazon-us',false,now).preparation).toBe('archived');
  product.status='draft';product.payload._catalog.kind='physical';(product.payload as any).source_update={hash:'pending'};
  expect(coverageItem(product,'amazon-us',false,now)).toMatchObject({preparation:'source_conflict',next_action:'reconcile_source'});
 });
 it('scopes both listing and uncertainty queries and discloses the report population',async()=>{
  const product=row(),{db,calls}=database([product],1,[product.sku]);mocks.db.mockReturnValue(db);
  const response=await GET(new NextRequest('http://localhost/api/catalog/coverage'));expect(response.status).toBe(200);
  const report=await response.json();expect(report).toMatchObject({total:1,includes_archived:true,population_basis:'owned_prelistings_only',source_store_population_reconciled:false,data:[{sku:product.sku,external:'uncertain'}]});
  for(const table of ['prelistings','catalog_submissions']){expect(calls).toContainEqual([table,'owner_id',auth.userId]);expect(calls).toContainEqual([table,'organization_id',auth.organizationId]);}
 });
 it('fails closed for unauthenticated requests, invalid paging and oversized populations',async()=>{
  mocks.auth.mockResolvedValue(null);expect((await GET(new NextRequest('http://localhost/api/catalog/coverage'))).status).toBe(401);expect(mocks.db).not.toHaveBeenCalled();
  mocks.auth.mockResolvedValue(auth);expect((await GET(new NextRequest('http://localhost/api/catalog/coverage?limit=1000'))).status).toBe(400);
  mocks.db.mockReturnValue(database([],5001).db);expect((await GET(new NextRequest('http://localhost/api/catalog/coverage'))).status).toBe(413);
 });
});
