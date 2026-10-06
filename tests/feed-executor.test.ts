import {beforeEach,describe,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({document:vi.fn(),upload:vi.fn(),create:vi.fn(),remote:vi.fn(),load:vi.fn()}));
vi.mock('../lib/marketplaces/amazon-feeds',()=>({createAmazonFeedDocument:mocks.document,uploadAmazonFeed:mocks.upload,createAmazonFeed:mocks.create,getAmazonFeed:mocks.remote,getAmazonFeedReport:vi.fn()}));
vi.mock('../lib/marketplaces/amazon',()=>({amazonConfig:()=>({sellerId:'SELLER',marketplaceId:'MARKET'})}));
vi.mock('../lib/catalog/family',()=>({assertFamily:vi.fn()}));
vi.mock('../lib/catalog/feed',()=>({buildAmazonFeed:()=>({header:{sellerId:'SELLER',version:'2.0'},messages:[{sku:'A',messageId:1,attributes:{}}]})}));
vi.mock('../lib/catalog/repository',async(importOriginal)=>({...await importOriginal<any>(),loadProduct:mocks.load}));
import {prepareFeed,submitFeed,monitorFeed,recoverFeedId} from '../lib/catalog/feed-executor';
const auth={userId:'owner',organizationId:'org',mode:'supabase-session' as const,roles:['admin'] as ('admin')[]};
function database(batch?:any) {
  const writes:{table:string;values:any}[]=[];
  const db:any={rpc:vi.fn().mockResolvedValue({data:'batch',error:null}),from:(table:string)=>{
    const query:any={eq:()=>query,is:()=>query,in:()=>query,select:()=>query,update:(values:any)=>{writes.push({table,values});return query;},maybeSingle:()=>Promise.resolve({data:batch||{id:'batch'},error:null}),then:(resolve:any)=>Promise.resolve({data:{id:'batch'},error:null}).then(resolve)};
    return query;
  }};
  return {db,writes};
}
beforeEach(()=>{
  vi.clearAllMocks();vi.stubEnv('PRELISTING_ENABLE_PUBLICATION','true');vi.stubEnv('PRELISTING_ENABLE_FEEDS','true');
  mocks.load.mockResolvedValue({product:{sku:'A',title:'Fixture'},row:{updated_at:'2026-10-05T18:00:00Z'}});
  mocks.document.mockResolvedValue({feedDocumentId:'document',url:'https://fixture'});mocks.upload.mockResolvedValue(undefined);mocks.create.mockResolvedValue({feedId:'FEED'});
});
describe('durable feed submission and recovery',()=>{
  it('requires an explicit retry reference and performs no external write if the durable retry guard rejects it',async()=>{
    const {db}=database(),retry='00000000-0000-4000-8000-000000000021';
    db.rpc.mockResolvedValueOnce({data:null,error:{code:'unsafe_retry'}});
    const prepared=await prepareFeed(db,auth,['A']);await expect(submitFeed(db,auth,['A'],prepared.manifest_hash,true,retry)).rejects.toMatchObject({status:409});
    expect(db.rpc).toHaveBeenCalledWith('reserve_catalog_feed',expect.objectContaining({p_retry_of:retry}));expect(mocks.document).not.toHaveBeenCalled();
  });
  it('requires administrator attestation and checks remote feed identity before associating a lost ID',async()=>{
    const created_at=new Date(Date.now()-300000).toISOString();
    const {db,writes}=database({id:'batch',status:'unknown',created_at,updated_at:created_at,manifest_hash:'manifest',target:{seller_id:'SELLER',marketplace_id:'MARKET'}});
    await expect(recoverFeedId(db,auth,'batch','123','Conferido no Seller Central',false)).rejects.toMatchObject({status:403});expect(mocks.remote).not.toHaveBeenCalled();
    mocks.remote.mockResolvedValueOnce({feedId:'123',feedType:'OTHER',marketplaceIds:['MARKET'],createdTime:created_at,processingStatus:'DONE'});
    await expect(recoverFeedId(db,auth,'batch','123','Conferido no Seller Central',true)).rejects.toMatchObject({status:422});expect(writes).toEqual([]);
    mocks.remote.mockResolvedValueOnce({feedId:'123',feedType:'JSON_LISTINGS_FEED',marketplaceIds:['MARKET'],createdTime:created_at,processingStatus:'DONE'});
    expect((await recoverFeedId(db,auth,'batch','123','Conferido documento e manifesto no Seller Central',true)).identity).toBe('administrator_attested');
    expect(writes[0].values.target.recovery_attestation).toMatchObject({actor:'owner',manifest_hash:'manifest'});
  });
  it('does not reserve or upload when the reviewed manifest changed',async()=>{
    const {db}=database();await expect(submitFeed(db,auth,['A'],'wrong',true)).rejects.toMatchObject({status:409});
    expect(db.rpc).not.toHaveBeenCalled();expect(mocks.document).not.toHaveBeenCalled();
  });
  it('releases SKU uncertainty when document upload failed before creating a feed',async()=>{
    const {db,writes}=database();mocks.upload.mockRejectedValueOnce(new Error('upload failed'));
    const prepared=await prepareFeed(db,auth,['A']);await expect(submitFeed(db,auth,['A'],prepared.manifest_hash,true)).rejects.toThrow('upload failed');
    expect(mocks.create).not.toHaveBeenCalled();expect(writes).toContainEqual({table:'catalog_feeds',values:expect.objectContaining({status:'failed'})});
    expect(writes).toContainEqual({table:'catalog_submissions',values:expect.objectContaining({status:'rejected'})});
  });
  it('keeps every SKU uncertain when createFeed times out after the request started',async()=>{
    const {db,writes}=database();mocks.create.mockRejectedValueOnce(new Error('timeout'));
    const prepared=await prepareFeed(db,auth,['A']);await expect(submitFeed(db,auth,['A'],prepared.manifest_hash,true)).rejects.toThrow('timeout');
    expect(writes).toContainEqual({table:'catalog_feeds',values:expect.objectContaining({status:'unknown'})});
    expect(writes).toContainEqual({table:'catalog_submissions',values:expect.objectContaining({status:'unknown'})});
  });
  it('does not reapply a completed report or overwrite later reconciliation',async()=>{
    const {db,writes}=database({id:'batch',target:{seller_id:'SELLER',marketplace_id:'MARKET'},status:'completed',processing_status:'DONE'});
    expect(await monitorFeed(db,auth,'batch')).toEqual({id:'batch',status:'completed',processing_status:'DONE'});
    expect(mocks.remote).not.toHaveBeenCalled();expect(writes).toEqual([]);
  });
});
