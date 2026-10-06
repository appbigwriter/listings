import {hash,type Channel} from './model';
export type MonitorTarget={channel:Channel;account_id:string;marketplace_id:string};
export function monitorSchedule(rows:Record<string,any>[],targets:MonitorTarget[],now:number,intervalMinutes:number,limit=100){
 if(!Number.isSafeInteger(intervalMinutes)||intervalMinutes<15||intervalMinutes>1440||!Number.isSafeInteger(limit)||limit<1||limit>5000||!Number.isFinite(now))throw new Error('Polling requer intervalo de 15 a 1.440 minutos e limite de 1 a 5.000.');
 const window=Math.floor(now/(intervalMinutes*60000)),latest=new Map<string,Record<string,any>>();
 for(const row of rows){
  if(!row.owner_id||!row.organization_id||typeof row.sku!=='string'||!row.sku||!['accepted','processing','published','unknown','submitting','rejected'].includes(row.status))continue;
  const receiptDate=Date.parse(row.created_at),updated=Date.parse(row.updated_at);
  if(!Number.isFinite(receiptDate)||!Number.isFinite(updated)||updated>now+300000||row.status==='submitting'&&now-updated<180000)continue;
  const account=row.channel==='amazon-us'?row.target?.seller_id:row.target?.account_id;
  const target=targets.find(target=>target.channel===row.channel&&target.account_id===account&&target.marketplace_id===row.target?.marketplace_id);if(!target)continue;
  const key=JSON.stringify([row.organization_id,row.owner_id,row.sku,row.channel]),previous=latest.get(key);if(!previous||Date.parse(previous.created_at)<receiptDate)latest.set(key,row);
 }
 return [...latest.values()].filter(row=>row.status!=='rejected'&&(now-Date.parse(row.updated_at)>=intervalMinutes*60000||row.status==='unknown')).sort((a,b)=>Date.parse(a.updated_at)-Date.parse(b.updated_at)||String(a.id).localeCompare(String(b.id))).slice(0,limit).map(row=>({sku:row.sku,channel:row.channel as Channel,owner_id:row.owner_id,organization_id:row.organization_id,idempotency_identity:{purpose:'scheduled_readback',window,sku:row.sku,channel:row.channel,account_hash:hash(row.target?.seller_id||row.target?.account_id),marketplace_id:row.target?.marketplace_id}}));
}
