import {randomUUID} from 'node:crypto';
import type {SupabaseClient} from '@supabase/supabase-js';
import {parseListingNotification,type NotificationConfig} from '../marketplaces/amazon-notifications';
import {hash} from './model';
import {CatalogError} from './repository';
import {executeAction} from './executor';

/** Queue acknowledgements are safe only after this durable completion record exists. */
export async function processListingEvent(db:SupabaseClient,body:string,config:NotificationConfig) {
 const notification=parseListingNotification(body,config),sku=notification.Payload.Sku;
 const product=await db.from('prelistings').select('id,owner_id,organization_id,status').eq('organization_id',config.organizationId).eq('sku',sku).maybeSingle();
 if(product.error)throw new CatalogError('Não foi possível localizar o SKU do evento.',503);
 if(!product.data?.owner_id)throw new CatalogError('Evento sem SKU atribuído à organização; mantenha-o na fila de investigação.',404);
 const owner=product.data.owner_id,payloadHash=hash(notification),notificationId=notification.NotificationMetadata.NotificationId;
 const values={id:randomUUID(),organization_id:config.organizationId,owner_id:owner,prelisting_id:product.data.id,sku,provider:'amazon',notification_id:notificationId,notification_type:notification.NotificationType,event_time:notification.EventTime,payload_hash:payloadHash,payload:notification,status:'pending'};
 const inserted=await db.from('catalog_events').insert(values).select('*').single();
 if(inserted.error&&inserted.error.code!=='23505')throw new CatalogError('Não foi possível registrar o evento.',503);
 const stored=inserted.error?await db.from('catalog_events').select('*').eq('organization_id',config.organizationId).eq('provider','amazon').eq('notification_id',notificationId).maybeSingle():inserted;
 if(stored.error||!stored.data)throw new CatalogError('Registro de evento indisponível.',503);
 const record=stored.data;
 if(record.payload_hash!==payloadHash||record.owner_id!==owner||record.prelisting_id!==product.data.id)throw new CatalogError('Notificação duplicada com identidade ou conteúdo divergente.',409);
 if(['completed','ignored'].includes(record.status))return {id:record.id,status:record.status,duplicate:true};
 const lease=randomUUID(),now=new Date().toISOString();
 const claimed=await db.from('catalog_events').update({status:'processing',lease_token:lease,lease_until:new Date(Date.now()+180000).toISOString(),attempts:record.attempts+1,updated_at:now,error_code:null}).eq('id',record.id).eq('organization_id',config.organizationId).eq('owner_id',owner).eq('updated_at',record.updated_at).or(`lease_until.is.null,lease_until.lt.${now}`).select('id').maybeSingle();
 if(claimed.error||!claimed.data)throw new CatalogError('Evento em processamento por outro consumidor.',409);
 const finish=async(status:string,error_code:string|null=null)=>{
  const result=await db.from('catalog_events').update({status,error_code,lease_token:null,lease_until:null,updated_at:new Date().toISOString()}).eq('id',record.id).eq('lease_token',lease).select('id').maybeSingle();
  if(result.error||!result.data)throw new CatalogError('Não foi possível confirmar o término durável do evento.',503);
 };
 try {
  // Old/out-of-order payloads only trigger a fresh account-scoped read. Never apply their status blindly.
  const auth={userId:owner,organizationId:config.organizationId,mode:'trusted-gateway' as const};
  if(product.data.status==='archived'){await finish('ignored');return {id:record.id,status:'ignored',reason:'archived'};}
  await executeAction(db,auth,sku,'monitor',{channel:'amazon-us'});
  await finish('completed');return {id:record.id,status:'completed'};
 } catch(error) {
  await finish('failed',error instanceof CatalogError?`CATALOG_${error.status}`:'PROCESSING_FAILED');throw error;
 }
}
