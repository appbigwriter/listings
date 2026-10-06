import {describe,it,expect,vi} from 'vitest';
import {invalidJobCheckpoint} from '../lib/catalog/job-checkpoint';
import {processJob} from '../lib/catalog/jobs';
const job={id:'job',owner_id:'owner',organization_id:'org',kind:'validate',status:'pending',updated_at:'2026-10-06T03:00:00Z',next_attempt_at:'2026-10-06T03:00:00Z',lease_until:null,total:1,cursor:0,attempts:0,payload:{skus:['SKU']},results:[]};
describe('poison checkpoint isolation',()=>{
 it('rejects corrupt entries/checkpoints while accepting zero-attempt pending work',()=>{
  expect(invalidJobCheckpoint(job)).toBeNull();expect(invalidJobCheckpoint({...job,cursor:1})).toBe('cursor_or_total');
  expect(invalidJobCheckpoint({...job,payload:{skus:[]}})).toBe('entries');expect(invalidJobCheckpoint({...job,payload:{skus:[{}]}})).toBe('entry_identity');
  expect(invalidJobCheckpoint({...job,results:{bad:true}})).toBe('attempts_or_results');
 });
 it('persists a terminal diagnostic once without running product preparation or leaving a lease timer',async()=>{
  const corrupted={...job,payload:{skus:[]}},writes:any[]=[];
  const query:any={eq:()=>query,or:()=>query,select:()=>query,maybeSingle:vi.fn().mockResolvedValueOnce({data:corrupted,error:null}).mockResolvedValueOnce({data:{...corrupted,status:'running'},error:null}).mockResolvedValueOnce({data:{...corrupted,status:'failed'},error:null})};
  const db:any={from:vi.fn(table=>{expect(table).toBe('catalog_jobs');return {...query,update:(values:any)=>{writes.push(values);return query;}};})};
  const result=await processJob(db,{userId:'owner',organizationId:'org',mode:'supabase-session'},'job');expect(result.status).toBe('failed');
  expect(writes.at(-1)).toMatchObject({status:'failed',lease_token:null,lease_until:null,results:[{code:'invalid_job_checkpoint',field:'entries'}]});expect(db.from).toHaveBeenCalledTimes(3);
 });
});
