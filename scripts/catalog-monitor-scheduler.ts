import {getSupabase} from '../lib/marketing/supabase';
import {amazonConfig} from '../lib/marketplaces/amazon';
import {ebayConfig} from '../lib/marketplaces/ebay';
import {oauthConfigured} from '../lib/marketplaces/oauth';
import {walmartAccountConfig} from '../lib/marketplaces/walmart-submission';
import {monitorSchedule,type MonitorTarget} from '../lib/catalog/monitor-schedule';
import {enqueueJob} from '../lib/catalog/jobs';
import {recoveryMode} from '../lib/operations/recovery';
import {traceWorkerFailure} from '../lib/operations/trace';
async function main(){
 const interval=Number(process.env.PRELISTING_POLLING_INTERVAL_MINUTES||0);if(interval===0){console.log(JSON.stringify({status:'disabled',external_writes:false}));return;}
 const limit=process.env.PRELISTING_POLLING_MAX_JOBS===undefined?100:Number(process.env.PRELISTING_POLLING_MAX_JOBS);monitorSchedule([],[],Date.now(),interval,limit);
 const db=getSupabase();if(!db)throw new Error('Supabase não configurado.');
 const once=process.argv.includes('--once');let stop=false;process.on('SIGINT',()=>{stop=true;});process.on('SIGTERM',()=>{stop=true;});
 do{
  const targets:MonitorTarget[]=[],amazon=amazonConfig(),ebay=ebayConfig();
  if(amazon.configured)targets.push({channel:'amazon-us',account_id:amazon.sellerId,marketplace_id:amazon.marketplaceId});
  if(ebay.configured)targets.push({channel:'ebay-us',account_id:ebay.accountId,marketplace_id:ebay.marketplaceId});
  if(oauthConfigured('walmart')){const walmart=walmartAccountConfig();targets.push({channel:'walmart-us',account_id:walmart.account_id,marketplace_id:walmart.marketplace_id});}
  const rows:any[]=[];let population:number|undefined;
  if(targets.length)for(let offset=0;offset<5000;offset+=500){const result=await db.from('catalog_latest_submissions').select('id,sku,channel,status,target,owner_id,organization_id,created_at,updated_at',{count:'exact'}).in('channel',targets.map(target=>target.channel)).order('id').range(offset,offset+499);if(result.error||result.count===null||result.count>5000||population!==undefined&&population!==result.count)throw new Error('População de polling indisponível/alterada/acima de 5.000; particione o serviço.');population=result.count;rows.push(...result.data);if(rows.length>=result.count)break;if(!result.data.length)throw new Error('População de polling incompleta.');}
  if(population!==undefined&&(rows.length!==population||new Set(rows.map(row=>row.id)).size!==rows.length))throw new Error('População de polling incompleta.');
  let created=0,skipped=0;
  for(const item of monitorSchedule(rows,targets,Date.now(),interval,limit)){
   if(stop)break;
   const product=await db.from('prelistings').select('updated_at').eq('owner_id',item.owner_id).eq('organization_id',item.organization_id).eq('sku',item.sku).neq('status','archived').maybeSingle();if(product.error)throw new Error('Catálogo indisponível no polling.');if(!product.data){skipped++;continue;}
   await enqueueJob(db,{userId:item.owner_id,organizationId:item.organization_id,mode:'trusted-gateway'},'monitor',{skus:[item.sku],channel:item.channel,versions:{[item.sku]:product.data.updated_at}},{idempotencyIdentity:item.idempotency_identity});created++;
  }
  console.log(JSON.stringify({status:'queued_read_only_jobs',jobs_checked:created,skipped,recovery_mode:recoveryMode(),external_writes:false}));
  if(!once&&!stop)await new Promise(resolve=>setTimeout(resolve,Math.min(60000,interval*60000)));
 }while(!once&&!stop);
}
main().catch(async error=>{await traceWorkerFailure('monitor.scheduler',{},error);process.exitCode=1;});
