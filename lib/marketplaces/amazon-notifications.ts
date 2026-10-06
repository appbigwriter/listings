import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import statusSchema from './schemas/amazon-status-notification-v1.json';
import issuesSchema from './schemas/amazon-issues-notification-2023-12-13.json';
import {amazonConfig} from './amazon';
import {CatalogError} from '../catalog/repository';

export type NotificationConfig={organizationId:string;queueUrl:string;region:string;accountId:string;source:string;applicationId:string;subscriptions:Record<string,string>;sellerId:string;marketplaceId:string};
export type ListingNotification={NotificationVersion:string;NotificationType:string;PayloadVersion:string;EventTime:string;Payload:{SellerId:string;MarketplaceId:string;Sku:string};NotificationMetadata:{ApplicationId:string;SubscriptionId:string;PublishTime:string;NotificationId:string}};
const ajv=new Ajv({strict:false,allErrors:true});addFormats(ajv);
// The upstream status schema spells its enum CHANGED although its example and API use CHANGE.
// Keep the downloaded snapshot intact and apply only this documented compatibility correction.
const correctedStatus=structuredClone(statusSchema);correctedStatus.properties.NotificationType.enum=['LISTINGS_ITEM_STATUS_CHANGE'];
const validators:Record<string,ReturnType<typeof ajv.compile>>={LISTINGS_ITEM_STATUS_CHANGE:ajv.compile(correctedStatus),LISTINGS_ITEM_ISSUES_CHANGE:ajv.compile(issuesSchema)};
export function notificationConfig():NotificationConfig {
 const region=process.env.AWS_REGION?.trim()||'',accountId=process.env.AMAZON_EVENTS_AWS_ACCOUNT_ID?.trim()||'',queueUrl=process.env.AMAZON_EVENTS_QUEUE_URL?.trim()||'';
 const organizationId=process.env.AMAZON_EVENTS_ORGANIZATION_ID?.trim()||'',source=process.env.AMAZON_EVENTS_SOURCE?.trim()||'',applicationId=process.env.AMAZON_EVENTS_APPLICATION_ID?.trim()||'';
 const subscriptions={LISTINGS_ITEM_STATUS_CHANGE:process.env.AMAZON_EVENTS_STATUS_SUBSCRIPTION_ID?.trim()||'',LISTINGS_ITEM_ISSUES_CHANGE:process.env.AMAZON_EVENTS_ISSUES_SUBSCRIPTION_ID?.trim()||'',...(process.env.AMAZON_EVENTS_DEFINITIONS_SUBSCRIPTION_ID?.trim()?{PRODUCT_TYPE_DEFINITIONS_CHANGE:process.env.AMAZON_EVENTS_DEFINITIONS_SUBSCRIPTION_ID.trim()}:{})};
 const amazon=amazonConfig();
 if(!amazon.configured||!/^\w{2}-[a-z]+-\d$/.test(region)||!/^\d{12}$/.test(accountId)||!/^[-\w]+$/.test(subscriptions.LISTINGS_ITEM_STATUS_CHANGE)||!/^[-\w]+$/.test(subscriptions.LISTINGS_ITEM_ISSUES_CHANGE)||!/^aws\.partner\/sellingpartnerapi\.amazon\.com\//.test(source)||!applicationId||! /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(organizationId))throw new CatalogError('Configure a conta, a organização, a fila EventBridge e as duas assinaturas antes de iniciar o consumidor.',503);
 let url:URL;try{url=new URL(queueUrl);}catch{throw new CatalogError('URL da fila SQS inválida.',503);}
 if(url.protocol!=='https:'||url.hostname!==`sqs.${region}.amazonaws.com`||url.port||url.username||url.password||url.search||url.hash||!new RegExp(`^/${accountId}/[A-Za-z0-9_-]{1,80}$`).test(url.pathname))throw new CatalogError('A fila deve pertencer à conta e região AWS configuradas.',503);
 return {organizationId,queueUrl,region,accountId,source,applicationId,subscriptions,sellerId:amazon.sellerId,marketplaceId:amazon.marketplaceId};
}
export function parseListingNotification(body:string,config:NotificationConfig):ListingNotification {
 if(Buffer.byteLength(body,'utf8')>256000)throw new CatalogError('Evento excede o limite de tamanho.');
 let event:any;try{event=JSON.parse(body);}catch{throw new CatalogError('Evento não contém JSON válido.');}
 if(!event||event.version!=='0'||event.account!==config.accountId||event.region!==config.region||event.source!==config.source)throw new CatalogError('Origem EventBridge não corresponde à configuração.',403);
 const notification=event.detail,validate=validators[notification?.NotificationType];
 if(!validate||!validate(notification))throw new CatalogError('Notificação fora do contrato suportado.');
 if(notification.NotificationVersion!=='1.0'||notification.PayloadVersion!==(notification.NotificationType==='LISTINGS_ITEM_STATUS_CHANGE'?'1.0':'2023-12-13'))throw new CatalogError('Versão da notificação não suportada.');
 const metadata=notification.NotificationMetadata,payload=notification.Payload;
 if(metadata.ApplicationId!==config.applicationId||metadata.SubscriptionId!==config.subscriptions[notification.NotificationType]||payload.SellerId!==config.sellerId||payload.MarketplaceId!==config.marketplaceId)throw new CatalogError('Notificação sem correspondência comprovada de conta, assinatura e marketplace.',403);
 if(!/^[\w-]{1,200}$/.test(metadata.NotificationId)||typeof payload.Sku!=='string'||!payload.Sku.trim()||payload.Sku.length>200||/[\u0000-\u001f]/.test(payload.Sku))throw new CatalogError('Identificador ou SKU da notificação inválido.');
 return notification;
}
