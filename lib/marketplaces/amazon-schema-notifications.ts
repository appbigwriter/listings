import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import officialSchema from './schemas/amazon-definitions-notification-v1.json';
import type {NotificationConfig} from './amazon-notifications';
import {CatalogError} from '../catalog/repository';

export type DefinitionsNotificationConfig=Omit<NotificationConfig,'applicationId'>&{applicationId?:string};
export type DefinitionNotification={NotificationVersion:'1.0';NotificationType:'PRODUCT_TYPE_DEFINITIONS_CHANGE';PayloadVersion:'1.0';EventTime:string;Payload:{AccountId:string;ProductTypeVersion:string;MarketplaceId?:string;NewProductTypes?:string[]};NotificationMetadata:{ApplicationId:string;SubscriptionId:string;PublishTime:string;NotificationId:string}};
const ajv=new Ajv({strict:false,allErrors:true});addFormats(ajv);
const validate=ajv.compile(officialSchema);
const safeId=(value:unknown,max=200):value is string=>typeof value==='string'&&new RegExp(`^[A-Za-z0-9_-]{1,${max}}$`).test(value);
const timestamp=(value:string)=>/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(Date.parse(value)).toISOString().slice(0,10)===value.slice(0,10);

/** Pure EventBridge parser. Queue acknowledgement requires the coordinator's durable fanout. */
export function parseDefinitionsNotification(body:string,config:DefinitionsNotificationConfig){
 if(typeof body!=='string'||Buffer.byteLength(body,'utf8')>256000)throw new CatalogError('Evento excede o limite de tamanho.');
 let envelope:unknown;try{envelope=JSON.parse(body);}catch{throw new CatalogError('Evento não contém JSON válido.');}
 if(!envelope||typeof envelope!=='object'||Array.isArray(envelope))throw new CatalogError('Origem EventBridge não corresponde à configuração.',403);
 const event=envelope as Record<string,unknown>;
 if(event.version!=='0'||event.account!==config.accountId||event.region!==config.region||event.source!==config.source)throw new CatalogError('Origem EventBridge não corresponde à configuração.',403);
 if(!validate(event.detail))throw new CatalogError('Notificação de definições fora do contrato suportado.');
 const notification=event.detail as DefinitionNotification;
 if(notification.NotificationType!=='PRODUCT_TYPE_DEFINITIONS_CHANGE'||notification.NotificationVersion!=='1.0'||notification.PayloadVersion!=='1.0')throw new CatalogError('Tipo ou versão da notificação de definições não suportados.');
 const metadata=notification.NotificationMetadata,payload=notification.Payload;
 const subscription=config.subscriptions.PRODUCT_TYPE_DEFINITIONS_CHANGE||process.env.AMAZON_EVENTS_DEFINITIONS_SUBSCRIPTION_ID?.trim();
 if(!safeId(subscription)||metadata.SubscriptionId!==subscription||payload.AccountId!==config.sellerId||(config.applicationId&&metadata.ApplicationId!==config.applicationId))throw new CatalogError('Notificação de definições sem correspondência de conta, aplicação ou assinatura.',403);
 if(config.marketplaceId!=='ATVPDKIKX0DER'||payload.MarketplaceId!==undefined&&payload.MarketplaceId!==config.marketplaceId)throw new CatalogError('Marketplace da notificação de definições não corresponde ao marketplace US configurado.',403);
 if(!safeId(metadata.NotificationId)||!safeId(metadata.SubscriptionId)||!safeId(payload.AccountId)||!safeId(payload.ProductTypeVersion)||typeof metadata.ApplicationId!=='string'||!/^[A-Za-z0-9._-]{1,256}$/.test(metadata.ApplicationId)||!timestamp(notification.EventTime)||!timestamp(metadata.PublishTime))throw new CatalogError('Identificadores, versão de produto ou datas da notificação de definições inválidos.');
 if(payload.NewProductTypes!==undefined&&(!Array.isArray(payload.NewProductTypes)||!payload.NewProductTypes.length||payload.NewProductTypes.length>1000||new Set(payload.NewProductTypes).size!==payload.NewProductTypes.length||payload.NewProductTypes.some(value=>typeof value!=='string'||!/^[A-Z][A-Z0-9_]{0,199}$/.test(value))))throw new CatalogError('Tipos de produto novos fora do contrato seguro suportado.');
 return {notification,sanitized:{notification_id:metadata.NotificationId,account_id:payload.AccountId,product_type_version:payload.ProductTypeVersion,marketplace_id:config.marketplaceId,marketplace_scope:payload.MarketplaceId===undefined?'all_marketplaces' as const:'configured' as const,new_product_types:payload.NewProductTypes?[...payload.NewProductTypes]:[],event_time:notification.EventTime,publish_time:metadata.PublishTime}};
}
