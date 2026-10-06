import {hash,type Channel} from '../catalog/model';
import {productFromRow,scopeQuery,CatalogError} from '../catalog/repository';
import {currentPublicationProof} from '../catalog/publication-proof';
import {CHANNELS} from '../catalog/channels';
import type {AuthContext} from '../auth';
type Entity=Record<string,any>;
export type Incident={fingerprint:string;rule:string;entity_id:string;channel?:Channel};
export const INCIDENT_ACTIONS:Record<string,string>={worker_lease_expired:'Verifique o supervisor e o checkpoint antes de retomar.',queue_stalled:'Verifique disponibilidade e quota do worker.',submission_uncertain:'Reconcilie a versão na plataforma antes de reenviar.',feed_uncertain:'Investigue o lote e recupere seu ID/relatório.',notification_failed:'Verifique o consumidor, origem e DLQ.',schema_changed:'Revise os requisitos novos e aprove uma nova versão.',publication_proof_stale:'Consulte novamente a versão externa do listing.'};
export function evaluateIncidents(snapshot:{jobs:Entity[];submissions:Entity[];feeds:Entity[];events:Entity[];products:Entity[]},now=Date.now()):Incident[]{
 const incidents:Incident[]=[],add=(rule:string,id:string,channel?:Channel)=>{if(!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id))throw new CatalogError('Identidade de incidente inválida.',503);incidents.push({rule,entity_id:id,...(channel?{channel}:{}),fingerprint:hash({rule,id,channel})});};
 const age=(value:unknown)=>typeof value==='string'&&Number.isFinite(Date.parse(value))?now-Date.parse(value):null;
 for(const job of snapshot.jobs){if(job.status==='running'&&age(job.lease_until)!==null&&age(job.lease_until)!>0)add('worker_lease_expired',job.id);if(job.status==='pending'&&age(job.updated_at)!==null&&age(job.updated_at)!>900000&&age(job.next_attempt_at)!==null&&age(job.next_attempt_at)!>=0)add('queue_stalled',job.id);}
 for(const submission of snapshot.submissions)if(submission.status==='unknown'||submission.status==='submitting'&&age(submission.created_at)!==null&&age(submission.created_at)!>180000)add('submission_uncertain',submission.id,CHANNELS.includes(submission.channel)?submission.channel:undefined);
 for(const feed of snapshot.feeds)if(feed.status==='unknown'||['preparing','uploading','submitting'].includes(feed.status)&&age(feed.updated_at)!==null&&age(feed.updated_at)!>180000)add('feed_uncertain',feed.id,'amazon-us');
 for(const event of snapshot.events)if(event.status==='failed')add('notification_failed',event.id,'amazon-us');
 for(const row of snapshot.products){const product=productFromRow(row);for(const channel of CHANNELS){const listing=product._catalog?.channels[channel];if(listing?.schema_change)add('schema_changed',row.id,channel);if(listing?.submission?.status==='published'&&!currentPublicationProof(product,channel,now))add('publication_proof_stale',row.id,channel);}}
 return incidents;
}
async function population(db:any,auth:AuthContext,table:string,select:string,statuses:string[]|null){
 const rows:Entity[]=[];let total:number|undefined;
 for(let offset=0;offset<5000;offset+=500){let query=scopeQuery(db.from(table).select(select,{count:'exact'}),auth);query=statuses?query.in('status',statuses):query.neq('status','archived');const result=await query.order('id').range(offset,offset+499);if(result.error||!Array.isArray(result.data)||!Number.isSafeInteger(result.count)||result.count>5000||total!==undefined&&total!==result.count)throw new CatalogError('População operacional indisponível, alterada ou acima de 5.000. Nenhum incidente foi encerrado.',503);total=result.count;rows.push(...result.data);if(rows.length>=result.count)break;if(!result.data.length)throw new CatalogError('População operacional incompleta.',503);}
 if(rows.length!==total||new Set(rows.map(row=>row.id)).size!==rows.length)throw new CatalogError('População operacional incompleta.',503);return rows;
}
export async function reconcileIncidents(db:any,auth:AuthContext){
 const observed=new Date().toISOString();
 const [jobs,submissions,feeds,events,products]=await Promise.all([population(db,auth,'catalog_jobs','id,status,lease_until,next_attempt_at,updated_at',['pending','running']),population(db,auth,'catalog_submissions','id,status,channel,created_at',['unknown','submitting']),population(db,auth,'catalog_feeds','id,status,updated_at',['unknown','preparing','uploading','submitting']),population(db,auth,'catalog_events','id,status',['failed']),population(db,auth,'prelistings','id,sku,title,brand,payload,human_reviewed,status',null)]);
 const incidents=evaluateIncidents({jobs,submissions,feeds,events,products},Date.parse(observed));
 const result=await db.rpc('reconcile_catalog_incidents',{p_owner:auth.userId,p_organization:auth.organizationId,p_observed_at:observed,p_incidents:incidents});if(result.error)throw new CatalogError('Não foi possível reconciliar os incidentes.',503);
 return {checked_at:observed,...result.data,external_notifications_sent:false};
}
