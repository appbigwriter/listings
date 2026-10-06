import type {AuthContext} from '../auth';
import {hasCapability} from '../auth';
import {hash,contentHash,type OfferAuthority,type ProductInput} from './model';
import {CatalogError} from './repository';
import {reviewRecordValid,signReviewRecord} from './approval';
type Account={sellerId:string;marketplaceId:string};
const domain='offer-authority-v1';
export function offerFields(fields:unknown):('price'|'qty')[]{
 if(!Array.isArray(fields)||!fields.length||fields.length>2||new Set(fields).size!==fields.length||fields.some(field=>!['price','qty'].includes(field)))throw new CatalogError('Selecione preço e/ou estoque.');
 return [...fields].sort();
}
const values=(product:ProductInput,fields:('price'|'qty')[])=>hash({fulfillment:product.fulfillment,asin:product.asin,values:Object.fromEntries(fields.map(field=>[field,product[field]]))});
export function recordOfferAuthority(product:ProductInput,auth:AuthContext,account:Account,fields:unknown,options:{enabled:boolean;reason:unknown;expires_hours?:unknown},now=Date.now()):OfferAuthority{
 if(!hasCapability(auth,'publish'))throw new CatalogError('Seu papel não permite definir a autoridade da oferta.',403);
 if(!account.sellerId?.trim()||account.marketplaceId!=='ATVPDKIKX0DER')throw new CatalogError('Configure a conta vendedora Amazon US antes de definir sua autoridade de oferta.',503);
 const selected=offerFields(fields),reason=typeof options.reason==='string'?options.reason.trim():'';
 if(!reason||reason.length>2000)throw new CatalogError('Registre o motivo e a fonte da decisão de autoridade (até 2.000 caracteres).');
 const hours=options.expires_hours===undefined?24:Number(options.expires_hours);if(!Number.isInteger(hours)||hours<1||hours>168)throw new CatalogError('Validade da autoridade deve ser de 1 a 168 horas.');
 const record={version:1 as const,sku:String(product.sku),owner_id:auth.userId,organization_id:auth.organizationId,channel:'amazon-us' as const,seller_id:account.sellerId,marketplace_id:account.marketplaceId,source:'prelisting' as const,status:options.enabled?'active' as const:'paused' as const,fields:selected,values_hash:values(product,selected),content_hash:contentHash(product),actor:auth.userId,reason,recorded_at:new Date(now).toISOString(),expires_at:new Date(now+hours*3600000).toISOString()};
 return {...record,signature:signReviewRecord(domain,record)};
}
export function assertOfferAuthority(product:ProductInput,auth:AuthContext,account:Account,fields:unknown,now=Date.now()){
 const selected=offerFields(fields),policy=product._catalog?.channels['amazon-us']?.offer_authority;
 if(!policy)throw new CatalogError('Registre a autoridade de preço/estoque para este SKU antes de preparar o PATCH.',422);
 const {signature,...record}=policy;
 if(!reviewRecordValid(domain,record,signature)||policy.version!==1||policy.source!=='prelisting'||policy.sku!==product.sku||policy.owner_id!==auth.userId||policy.organization_id!==auth.organizationId||policy.channel!=='amazon-us'||policy.seller_id!==account.sellerId||policy.marketplace_id!==account.marketplaceId)throw new CatalogError('Autoridade não corresponde ao SKU, proprietário ou conta atual.',409);
 if(policy.status!=='active'||!Number.isFinite(Date.parse(policy.recorded_at))||!Number.isFinite(Date.parse(policy.expires_at))||Date.parse(policy.recorded_at)>now+300000||Date.parse(policy.expires_at)<=now)throw new CatalogError('Autoridade pausada ou vencida. Registre uma nova decisão antes do envio.',422);
 if(selected.some(field=>!policy.fields.includes(field))||policy.values_hash!==values(product,policy.fields)||policy.content_hash!==contentHash(product))throw new CatalogError('Campos ou versão da oferta mudaram. Confirme novamente a autoridade dos valores.',409);
 return {record_hash:hash(policy),fields:selected,status:policy.status,expires_at:policy.expires_at};
}
