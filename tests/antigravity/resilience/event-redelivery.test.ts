import {afterEach,describe,it,expect,vi} from 'vitest';
import {mkdirSync,writeFileSync} from 'node:fs';
import statusSchema from '../../../lib/marketplaces/schemas/amazon-status-notification-v1.json';
import {processListingEvent} from '../../../lib/catalog/events';
import type {NotificationConfig} from '../../../lib/marketplaces/amazon-notifications';
import {createIsolatedTestDatabase} from '../fixtures/mock-db-helper';
import {eventPostgresAdapter} from './event-postgres-adapter';
afterEach(()=>vi.unstubAllGlobals());
describe('AG05 durable real event handler re-delivery with PostgreSQL constraints',()=>{
 it('ignores archived SKU exactly once, rejects changed duplicate identity and refuses foreign ownership',async()=>{
  vi.stubGlobal('fetch',async()=>{throw new Error('Network blocked');});const db=await createIsolatedTestDatabase();
  try{
   const owner='00000000-0000-4000-8000-000000000001',notification=structuredClone(statusSchema.examples[0]);
   const config:NotificationConfig={region:'us-east-1',accountId:'123456789012',queueUrl:'https://sqs.us-east-1.amazonaws.com/123456789012/listings',organizationId:owner,source:'aws.partner/sellingpartnerapi.amazon.com/fixture',applicationId:notification.NotificationMetadata.ApplicationId,subscriptions:{LISTINGS_ITEM_STATUS_CHANGE:notification.NotificationMetadata.SubscriptionId,LISTINGS_ITEM_ISSUES_CHANGE:'unused'},sellerId:notification.Payload.SellerId,marketplaceId:notification.Payload.MarketplaceId};
   await db.query('insert into prelistings(sku,title,status,owner_id,organization_id) values($1,$2,$3,$4,$4)',[notification.Payload.Sku,'Synthetic archived fixture','archived',owner]);
   const wrap=(detail:any)=>JSON.stringify({version:'0',account:config.accountId,region:config.region,source:config.source,detail});const adapter=eventPostgresAdapter(db) as any;
   const first=await processListingEvent(adapter,wrap(notification),config);expect(first.status).toBe('ignored');expect(await processListingEvent(adapter,wrap(notification),config)).toMatchObject({status:'ignored',duplicate:true,id:first.id});
   const changed=structuredClone(notification);changed.Payload.Status=[];await expect(processListingEvent(adapter,wrap(changed),config)).rejects.toMatchObject({status:409});
   await expect(processListingEvent(adapter,wrap(notification),{...config,organizationId:'00000000-0000-4000-8000-000000000002'})).rejects.toMatchObject({status:404});
   expect((await db.query<{count:number;attempts:number}>('select count(*)::int count,max(attempts)::int attempts from catalog_events')).rows[0]).toEqual({count:1,attempts:1});
   mkdirSync('artifacts/antigravity/AG-05',{recursive:true});writeFileSync('artifacts/antigravity/AG-05/event-redelivery.json',JSON.stringify({checked_at:new Date().toISOString(),handler:'actual_processListingEvent',database:'PGlite_actual_migrations',deliveries:2,durable_rows:1,attempts:1,changed_duplicate:'409',foreign_organization:'404',network:'blocked',archived_status:'ignored',limitation:'Archived path; no actual SQS acknowledgement or remote readback'},null,2));
  }finally{await db.close();}
 },10000);
});
