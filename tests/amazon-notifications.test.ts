import {beforeEach,describe,expect,it,vi} from 'vitest';
import statusSchema from '../lib/marketplaces/schemas/amazon-status-notification-v1.json';
import issuesSchema from '../lib/marketplaces/schemas/amazon-issues-notification-2023-12-13.json';
const mocks=vi.hoisted(()=>({execute:vi.fn()}));
vi.mock('../lib/catalog/executor',()=>({executeAction:mocks.execute}));
vi.mock('../lib/marketplaces/amazon',()=>({amazonConfig:()=>({configured:true,sellerId:'A3AYAZLIQ7AX77',marketplaceId:'ATVPDKIKX0DER'})}));
import {notificationConfig,parseListingNotification,type NotificationConfig} from '../lib/marketplaces/amazon-notifications';
import {processListingEvent} from '../lib/catalog/events';
const config:NotificationConfig={region:'us-east-1',accountId:'123456789012',queueUrl:'https://sqs.us-east-1.amazonaws.com/123456789012/listings',organizationId:'00000000-0000-4000-8000-000000000001',source:'aws.partner/sellingpartnerapi.amazon.com/fixture',applicationId:statusSchema.examples[0].NotificationMetadata.ApplicationId,subscriptions:{LISTINGS_ITEM_STATUS_CHANGE:statusSchema.examples[0].NotificationMetadata.SubscriptionId,LISTINGS_ITEM_ISSUES_CHANGE:issuesSchema.examples[0].NotificationMetadata.SubscriptionId},sellerId:'A3AYAZLIQ7AX77',marketplaceId:'ATVPDKIKX0DER'};
function event(issues=false) {
 const notification=structuredClone(issues?issuesSchema.examples[0]:statusSchema.examples[0]);notification.Payload.SellerId=config.sellerId;
 return {version:'0',account:config.accountId,region:config.region,source:config.source,detail:notification};
}
function database() {
 let stored:any;let unavailable=false;let product:any={id:'product',owner_id:'actual-owner',organization_id:config.organizationId,status:'draft'};
 const db:any={from:(table:string)=>{
  let op='read',values:any,filters:Record<string,any>={};
  const query:any={select:()=>query,eq:(key:string,value:any)=>{filters[key]=value;return query;},or:()=>query,insert:(input:any)=>{op='insert';values=input;return query;},update:(input:any)=>{op='update';values=input;return query;},single:async()=>resolve(),maybeSingle:async()=>resolve()};
  function resolve() {
   if(table==='prelistings')return {data:product,error:null};
   if(unavailable)return {data:null,error:{code:'unavailable'}};
   if(op==='insert'){if(stored)return {data:null,error:{code:'23505'}};stored={...values,attempts:0,updated_at:'old',lease_until:null};return {data:stored,error:null};}
   if(op==='update'){if(!stored||Object.entries(filters).some(([k,v])=>stored[k]!==v))return {data:null,error:null};stored={...stored,...values};return {data:stored,error:null};}
   return {data:stored,error:null};
  }return query;
 }};
 return {db,record:()=>stored,setProduct:(value:any)=>{product=value;},loseDatabase:()=>{unavailable=true;}};
}
beforeEach(()=>{vi.clearAllMocks();mocks.execute.mockResolvedValue({});});
describe('Amazon EventBridge notifications',()=>{
 it('accepts documented status name despite the upstream schema enum typo and the current issues version',()=>{
  expect(parseListingNotification(JSON.stringify(event()),config).NotificationType).toBe('LISTINGS_ITEM_STATUS_CHANGE');
  expect(parseListingNotification(JSON.stringify(event(true)),config).PayloadVersion).toBe('2023-12-13');
 });
 it.each(['account','region','source'])('rejects a mismatching EventBridge %s',key=>{
  const input:any=event();input[key]='other';expect(()=>parseListingNotification(JSON.stringify(input),config)).toThrow('Origem');
 });
 it.each(['SellerId','MarketplaceId'])('does not route events across %s',key=>{
  const input:any=event();input.detail.Payload[key]='other';expect(()=>parseListingNotification(JSON.stringify(input),config)).toThrow('correspondência');
 });
 it('retains notifications without marketplace, with deprecated version or foreign subscription',()=>{
  const missing:any=event();delete missing.detail.Payload.MarketplaceId;expect(()=>parseListingNotification(JSON.stringify(missing),config)).toThrow('correspondência');
  const old:any=event(true);old.detail.PayloadVersion='1.0';expect(()=>parseListingNotification(JSON.stringify(old),config)).toThrow('Versão');
  const other:any=event();other.detail.NotificationMetadata.SubscriptionId='foreign';expect(()=>parseListingNotification(JSON.stringify(other),config)).toThrow('correspondência');
 });
 it('rejects custom queue endpoints even when all identifiers exist',()=>{
  for(const [key,value] of Object.entries({AWS_REGION:config.region,AMAZON_EVENTS_AWS_ACCOUNT_ID:config.accountId,AMAZON_EVENTS_QUEUE_URL:config.queueUrl,AMAZON_EVENTS_ORGANIZATION_ID:config.organizationId,AMAZON_EVENTS_SOURCE:config.source,AMAZON_EVENTS_APPLICATION_ID:config.applicationId,AMAZON_EVENTS_STATUS_SUBSCRIPTION_ID:config.subscriptions.LISTINGS_ITEM_STATUS_CHANGE,AMAZON_EVENTS_ISSUES_SUBSCRIPTION_ID:config.subscriptions.LISTINGS_ITEM_ISSUES_CHANGE}))vi.stubEnv(key,value);
  expect(notificationConfig().queueUrl).toBe(config.queueUrl);vi.stubEnv('AMAZON_EVENTS_QUEUE_URL','https://example.com/queue');expect(()=>notificationConfig()).toThrow('conta e região');vi.unstubAllEnvs();
 });
 it('deduplicates completed deliveries, derives owner from the stored SKU and refreshes instead of applying event status',async()=>{
  const {db,record}=database(),body=JSON.stringify(event());
  expect((await processListingEvent(db,body,config)).status).toBe('completed');
  expect(mocks.execute).toHaveBeenCalledWith(db,{userId:'actual-owner',organizationId:config.organizationId,mode:'trusted-gateway'},'NLS-SHOES-03','monitor',{channel:'amazon-us'});
  expect((await processListingEvent(db,body,config)).duplicate).toBe(true);expect(mocks.execute).toHaveBeenCalledTimes(1);expect(record().attempts).toBe(1);
 });
 it('retains changed duplicate payloads, unknown SKUs and readback failures without claiming completion',async()=>{
  const fixture=database(),body=JSON.stringify(event());mocks.execute.mockRejectedValueOnce(new Error('timeout'));
  await expect(processListingEvent(fixture.db,body,config)).rejects.toThrow('timeout');expect(fixture.record().status).toBe('failed');
  expect((await processListingEvent(fixture.db,body,config)).status).toBe('completed');expect(fixture.record().attempts).toBe(2);
  const changed:any=event();changed.detail.Payload.Status=[];await expect(processListingEvent(fixture.db,JSON.stringify(changed),config)).rejects.toMatchObject({status:409});
  fixture.setProduct(null);await expect(processListingEvent(fixture.db,body,config)).rejects.toMatchObject({status:404});expect(mocks.execute).toHaveBeenCalledTimes(2);
 });
 it('ignores archived products durably without touching the listing',async()=>{
  const fixture=database();fixture.setProduct({id:'product',owner_id:'actual-owner',status:'archived'});
  expect((await processListingEvent(fixture.db,JSON.stringify(event()),config)).status).toBe('ignored');expect(mocks.execute).not.toHaveBeenCalled();
 });
 it('does not read Amazon if the event cannot be durably recorded',async()=>{
  const fixture=database();fixture.loseDatabase();await expect(processListingEvent(fixture.db,JSON.stringify(event()),config)).rejects.toMatchObject({status:503});expect(mocks.execute).not.toHaveBeenCalled();
 });
});
