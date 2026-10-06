import {afterEach,describe,expect,it,vi} from 'vitest';
import snapshot from '../../../lib/marketplaces/schemas/amazon-definitions-notification-v1.json';
import {parseDefinitionsNotification,type DefinitionsNotificationConfig} from '../../../lib/marketplaces/amazon-schema-notifications';
const config:DefinitionsNotificationConfig={organizationId:'00000000-0000-4000-8000-000000000001',queueUrl:'https://sqs.us-east-1.amazonaws.com/123456789012/schema-events',region:'us-east-1',accountId:'123456789012',source:'aws.partner/sellingpartnerapi.amazon.com/fixture',applicationId:snapshot.examples[0].NotificationMetadata.ApplicationId,subscriptions:{PRODUCT_TYPE_DEFINITIONS_CHANGE:snapshot.examples[0].NotificationMetadata.SubscriptionId},sellerId:snapshot.examples[0].Payload.AccountId,marketplaceId:'ATVPDKIKX0DER'};
function event(){return {version:'0',account:config.accountId,region:config.region,source:config.source,detail:structuredClone(snapshot.examples[0])};}
afterEach(()=>vi.unstubAllEnvs());
describe('PRODUCT_TYPE_DEFINITIONS_CHANGE envelope and payload contract',()=>{
 it('accepts the official example and exposes bounded routing fields without mutating the notification',()=>{
  const input=event(),before=JSON.stringify(input),parsed=parseDefinitionsNotification(before,config);expect(parsed.notification).toEqual(input.detail);expect(parsed.sanitized).toMatchObject({marketplace_scope:'configured',marketplace_id:'ATVPDKIKX0DER',new_product_types:['LUGGAGE','SHOES']});expect(JSON.stringify(input)).toBe(before);
 });
 it('accepts documented omission of marketplace/new types only for configured US, without inventing product types',()=>{
  const input=event();delete (input.detail.Payload as any).MarketplaceId;delete (input.detail.Payload as any).NewProductTypes;
  expect(parseDefinitionsNotification(JSON.stringify(input),config).sanitized).toMatchObject({marketplace_scope:'all_marketplaces',new_product_types:[]});
  expect(()=>parseDefinitionsNotification(JSON.stringify(input),{...config,marketplaceId:'A1PA6795UKMFR9'})).toThrow('Marketplace');
 });
 it.each(['account','region','source'])('refuses EventBridge %s mismatch',field=>{
  const input:any=event();input[field]='foreign';expect(()=>parseDefinitionsNotification(JSON.stringify(input),config)).toThrow('Origem');
 });
 it.each(['AccountId','MarketplaceId'])('refuses payload %s crossing account/marketplace',field=>{
  const input:any=event();input.detail.Payload[field]='FOREIGN';expect(()=>parseDefinitionsNotification(JSON.stringify(input),config)).toThrow();
 });
 it('requires subscription and checks application when explicitly configured, permitting optional application configuration',()=>{
  const input=event();expect(()=>parseDefinitionsNotification(JSON.stringify(input),{...config,subscriptions:{}})).toThrow('assinatura');
  expect(()=>parseDefinitionsNotification(JSON.stringify(input),{...config,applicationId:'foreign'})).toThrow('aplicação');
  expect(parseDefinitionsNotification(JSON.stringify(input),{...config,applicationId:undefined}).notification.NotificationType).toBe('PRODUCT_TYPE_DEFINITIONS_CHANGE');
  vi.stubEnv('AMAZON_EVENTS_DEFINITIONS_SUBSCRIPTION_ID',config.subscriptions.PRODUCT_TYPE_DEFINITIONS_CHANGE);expect(parseDefinitionsNotification(JSON.stringify(input),{...config,subscriptions:{}}).sanitized.notification_id).toBe(input.detail.NotificationMetadata.NotificationId);
 });
 it.each(['NotificationVersion','PayloadVersion','NotificationType'])('refuses unsupported %s',field=>{
  const input:any=event();input.detail[field]='unsupported';expect(()=>parseDefinitionsNotification(JSON.stringify(input),config)).toThrow('versão');
 });
 it('rejects oversized/invalid JSON, empty/unsafe identifiers, malformed timestamps and invalid product types',()=>{
  for(const body of ['{','x'.repeat(256001),'null','[]'])expect(()=>parseDefinitionsNotification(body,config)).toThrow();
  for(const version of ['',null,'v\n2','.. /secret']){const input:any=event();input.detail.Payload.ProductTypeVersion=version;expect(()=>parseDefinitionsNotification(JSON.stringify(input),config)).toThrow();}
  for(const values of [[],[''],['SHOES','SHOES'],['shoe<script>'],[null],new Array(1001).fill('SHOES')]){const input:any=event();input.detail.Payload.NewProductTypes=values;expect(()=>parseDefinitionsNotification(JSON.stringify(input),config)).toThrow();}
  const input=event();input.detail.EventTime='2026-02-30T00:00:00Z';expect(()=>parseDefinitionsNotification(JSON.stringify(input),config)).toThrow('datas');
 });
});
