import {traceRequest} from '../../../../lib/operations/trace';
import {NextRequest,NextResponse} from 'next/server';
import {resolveAuthContext,unauthorized} from '../../../../lib/auth';
import {getSupabase} from '../../../../lib/marketing/supabase';
import {scopeQuery} from '../../../../lib/catalog/repository';
async function handleGET(req:NextRequest) {
  const auth=await resolveAuthContext(req);if(!auth)return NextResponse.json(unauthorized(),{status:401});
  const db=getSupabase();if(!db)return NextResponse.json({error:'Supabase não configurado.'},{status:503});
  const now=new Date(),day=now.toISOString().slice(0,10)+'T00:00:00Z';
  const [queued,stalled,failed,uncertain,feeds,ai,events]=await Promise.all([
    scopeQuery(db.from('catalog_jobs').select('id',{count:'exact',head:true}),auth).in('status',['pending','running']),
    scopeQuery(db.from('catalog_jobs').select('id',{count:'exact',head:true}),auth).eq('status','running').lt('lease_until',now.toISOString()),
    scopeQuery(db.from('catalog_jobs').select('id,kind,status,cursor,total,results,created_at,updated_at'),auth).order('updated_at',{ascending:false}).limit(20),
    scopeQuery(db.from('catalog_submissions').select('id,sku,channel,status,target,feed_batch_id,created_at,updated_at'),auth).in('status',['unknown','submitting']).order('created_at').limit(100),
    scopeQuery(db.from('catalog_feeds').select('id,status,feed_id,processing_status,created_at,updated_at'),auth).in('status',['unknown','failed','processing','submitting','uploading','preparing']).order('created_at').limit(100),
    scopeQuery(db.from('catalog_ai_operations').select('reserved_usd_micro,estimated_usd_micro',{count:'exact'}),auth).gte('created_at',day).order('created_at',{ascending:false}).limit(1000),
    scopeQuery(db.from('catalog_events').select('id,sku,notification_type,status,attempts,error_code,event_time,updated_at'),auth).in('status',['pending','processing','failed']).order('created_at').limit(100),
  ]);
  if([queued,stalled,failed,uncertain,feeds,ai,events].some(result=>result.error))return NextResponse.json({error:'Diagnóstico operacional indisponível.'},{status:503});
  const jobs=(failed.data||[]).map((job:any)=>({id:job.id,kind:job.kind,status:job.status,cursor:job.cursor,total:job.total,last_trace:Array.isArray(job.results)?job.results.at(-1)?.trace||null:null,failed_items:(Array.isArray(job.results)?job.results:[]).filter((result:any)=>result.status==='failed').length,retries:(Array.isArray(job.results)?job.results:[]).filter((result:any)=>result.status==='retry').length,created_at:job.created_at,updated_at:job.updated_at}));
  const aiCosts={scope:'current_owner',operations_in_sample:(ai.data||[]).length,complete:(ai.count||0)<=(ai.data||[]).length,reserved_usd:(ai.data||[]).reduce((sum:number,item:any)=>sum+Number(item.reserved_usd_micro),0)/1000000,estimated_known_usd:(ai.data||[]).reduce((sum:number,item:any)=>sum+Number(item.estimated_usd_micro||0),0)/1000000,unknown_usage_operations:(ai.data||[]).filter((item:any)=>item.estimated_usd_micro===null).length,organization_daily_budget_configured:Boolean(process.env.PRELISTING_AI_DAILY_USD?.trim())};
  return NextResponse.json({ai_costs:aiCosts,checked_at:now.toISOString(),queued_jobs:queued.count,expired_worker_leases:stalled.count,recent_jobs:jobs,uncertain_submissions:uncertain.data,open_feeds:feeds.data,pending_listing_events:events.data,ai_operations_today_for_owner:ai.count,ai_day_timezone:'UTC',alerts:[...(stalled.count?['Há reservas de worker expiradas; confira o supervisor.']:[]),...(uncertain.data?.some((item:any)=>item.status==='unknown')?['Há envios incertos; reconcilie antes de reenviar.']:[]),...(jobs.some((item:any)=>item.failed_items)?['Há itens que falharam nos lotes recentes; revise os resultados.']:[]),...(events.data?.some((item:any)=>item.status==='failed')?['Há avisos Amazon com falha de atualização. Confira o consumidor e a DLQ AWS.']:[])]});
}

export function GET(req:NextRequest){return traceRequest('api.catalog.operations',()=>handleGET(req));}
