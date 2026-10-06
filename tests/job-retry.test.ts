import {describe,it,expect,vi} from 'vitest';
import {retryEntries} from '../lib/catalog/job-retry';
import {enqueueJob} from '../lib/catalog/jobs';
const job={status:'completed',kind:'validate',total:3,cursor:3,payload:{skus:['A','B','C']},results:[{index:0,status:'retry'},{index:0,status:'processed'},{index:1,status:'failed'},{index:2,status:'processed'}]};
describe('explicit queue retry planning',()=>{
 it('keeps one child attempt per parent and scope even if current product versions later change',async()=>{
  const keys:string[]=[];const db={from:()=>{const query:any={select:()=>query,eq:(field:string,value:string)=>{if(field==='idempotency_key')keys.push(value);return query;},maybeSingle:async()=>({data:{id:'existing-child'},error:null})};return query;}};
  const auth={userId:'owner',organizationId:'org',mode:'supabase-session' as const};
  await enqueueJob(db as any,auth,'validate',{skus:['B'],versions:{B:'old'},retry_of:'parent',retry_scope:'failed'});
  await enqueueJob(db as any,auth,'validate',{skus:['B'],versions:{B:'new'},retry_of:'parent',retry_scope:'failed'});
  expect(keys).toHaveLength(2);expect(keys[0]).toBe(keys[1]);
 });
 it('retries only final failed outcomes and preserves original checkpoints',()=>{
  expect(retryEntries(job,'failed')).toEqual({indices:[1],entries:['B']});expect(job.cursor).toBe(3);expect(job.results).toHaveLength(4);
 });
 it('resumes only unprocessed entries of a cancelled import without replaying completed items',()=>{
  const incoming=[{sku:'A'},{sku:'B'},{sku:'C'}];expect(retryEntries({...job,status:'cancelled',kind:'import',cursor:1,payload:{products:incoming}},'unfinished')).toEqual({indices:[1,2],entries:incoming.slice(1)});
 });
 it('rejects active jobs, invalid checkpoints and a finished scope',()=>{
  expect(()=>retryEntries({...job,status:'running'},'failed')).toThrow('Espere');expect(()=>retryEntries({...job,cursor:4},'failed')).toThrow('Checkpoint');expect(()=>retryEntries({...job,payload:{skus:['A']}},'failed')).toThrow('Checkpoint');expect(()=>retryEntries(job,'unfinished')).toThrow('Não há');
 });
 it('uses the latest outcome instead of replaying an item that later succeeded',()=>{
  expect(()=>retryEntries({...job,results:[...job.results,{index:1,status:'processed'}]},'failed')).toThrow('Não há');
 });
});
