import {createHmac,timingSafeEqual} from 'node:crypto';
import type {AuthContext} from '../auth';
import {channelProduct,contentHash,hash} from '../catalog/model';
import {CatalogError,productFromRow} from '../catalog/repository';
import {evaluateReadiness} from '../catalog/readiness';
import {currentPublicationProof} from '../catalog/publication-proof';
import {recoveryMode} from '../operations/recovery';
import {getMarketingProfileContext} from './profile-guard';
import {buildReadinessGate,validateAmazonDestination} from './validation';
function withoutOperationalFields(value:Record<string,unknown>|null|undefined) {
 return value?Object.fromEntries(Object.entries(value).filter(([key])=>!['id','owner_id','organization_id','marketing_profile_id','created_at','updated_at','status','approval_notes'].includes(key))):null;
}
function reviewSecret() {
 const secret=process.env.PRELISTING_REVIEW_SECRET||process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(secret)return secret;if(process.env.NODE_ENV==='test')return 'test-marketing-review-secret';throw new CatalogError('Configure a chave de aprovação antes de revisar marketing.',503);
}
function signature(record:any,versionHash:string) {
 return createHmac('sha256',reviewSecret()).update(JSON.stringify([String(record.organization_id).toLowerCase(),String(record.owner_id).toLowerCase(),record.sku,record.approver,record.decision,record.comments,new Date(record.created_at).toISOString(),versionHash])).digest('hex');
}
export function sealMarketingApproval<T extends Record<string,unknown>>(record:T,versionHash:string) {return {...record,content_hash:versionHash,signature:signature(record,versionHash)};}
export function marketingApprovalCurrent(record:any,versionHash:string,auth:AuthContext) {
 if(!record||record.decision!=='approved'||record.content_hash!==versionHash||String(record.owner_id).toLowerCase()!==auth.userId.toLowerCase()||String(record.organization_id).toLowerCase()!==auth.organizationId.toLowerCase()||! /^[a-f0-9]{64}$/.test(record.signature||''))return false;
 try{return timingSafeEqual(Buffer.from(record.signature,'hex'),Buffer.from(signature(record,versionHash),'hex'));}catch{return false;}
}
export function marketingSnapshot(listing:any,profile:any,amazon:any,meta:any,tracking:any) {
 const product=channelProduct(productFromRow(listing),'amazon-us');
 const fields=['sku','title','description','bullets','keywords','brand','material','price','shipping_charge','qty','asin','amazon_url','images','fulfillment','pkg_length','pkg_width','pkg_height','pkg_weight'];
 return {version:'marketing-review-v1',product:{...Object.fromEntries(fields.filter(field=>product[field]!==undefined).map(field=>[field,product[field]])),sku:String(product.sku),content_hash:contentHash(product,'amazon-us'),facts:product._catalog?.facts},profile:withoutOperationalFields(profile),amazon_plan:amazon?.plan||null,meta_plan:meta?.plan||null,tracking:withoutOperationalFields(tracking)};
}
export async function loadMarketingReview(db:any,auth:AuthContext,sku:string,context?:Awaited<ReturnType<typeof getMarketingProfileContext>>) {
 const current=context||await getMarketingProfileContext(db,auth,sku);
 if(current.error)throw new CatalogError('Não foi possível ler a versão de marketing.',503);
 if(current.archived||!current.listing||!current.profile)throw new CatalogError('Perfil ou SKU ativo não encontrado.',404);
 const scoped=(table:string)=>db.from(table).select('*').eq('sku',sku).eq('organization_id',auth.organizationId).eq('owner_id',auth.userId).maybeSingle();
 const [amazon,meta,tracking]=await Promise.all([scoped('amazon_campaign_plans'),scoped('meta_campaign_plans'),scoped('tracking_plans')]);
 if([amazon,meta,tracking].some(result=>result.error))throw new CatalogError('Não foi possível conferir planos e tracking.',503);
 const snapshot=marketingSnapshot(current.listing,current.profile,amazon.data,meta.data,tracking.data),versionHash=hash(snapshot);
 const gate=buildReadinessGate(snapshot.product,current.profile.economics?.margin);
 if(recoveryMode())gate.blockers.push('operational_recovery_active');
 const prepared=productFromRow(current.listing),amazonListing=prepared._catalog?.channels['amazon-us'];
 if(!evaluateReadiness(prepared,'amazon-us').ready)gate.blockers.push('product_preparation_required');
 if(amazonListing?.submission?.status!=='published'||amazonListing.submission.publication_status!=='buyable'||!currentPublicationProof(prepared,'amazon-us'))gate.blockers.push('listing_not_verified_buyable');
 const costs=current.profile.economics?.costs;
 if(typeof costs?.source!=='string'||!costs.source.trim()||costs.source.length>1000||!Number.isFinite(Date.parse(costs?.calculated_at)))gate.blockers.push('cost_provenance_required');
 if(snapshot.tracking?.destination_url)gate.blockers.push(...validateAmazonDestination(snapshot.product,snapshot.tracking.destination_url));
 if(snapshot.meta_plan?.destination_url)gate.blockers.push(...validateAmazonDestination(snapshot.product,snapshot.meta_plan.destination_url));
 gate.blockers=[...new Set(gate.blockers)];gate.ready=gate.blockers.length===0;
 return {...current,snapshot,content_hash:versionHash,gate,approval_current:marketingApprovalCurrent(current.latestApproval,versionHash,auth),versions:{listing:current.listing.updated_at||null,profile:current.profile.updated_at||null,amazon:amazon.data?.updated_at||null,meta:meta.data?.updated_at||null,tracking:tracking.data?.updated_at||null}};
}
