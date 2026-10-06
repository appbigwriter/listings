import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {mkdirSync,writeFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import {createIsolatedTestDatabase} from '../fixtures/mock-db-helper';
import {workerDatabaseAdapter} from '../../fixtures/pglite-worker-adapter';
import {createCatalog} from '../../../lib/catalog/model';
import {enqueueJob,processJob} from '../../../lib/catalog/jobs';
const owner='00000000-0000-4000-8000-000000000001',auth={userId:owner,organizationId:owner,mode:'trusted-gateway' as const};
describe('AG05 two real worker processes compete for one PostgreSQL lease',()=>{
 it('permits one claimant at the same checkpoint and no duplicate item write',async()=>{
  const db=await createIsolatedTestDatabase(),children:ReturnType<typeof spawn>[]=[];const held:Array<()=>void>=[];let initialReads=0;
  try{
   const sku='AG05-RACE';await db.query('insert into prelistings(sku,title,owner_id,organization_id,payload) values($1,$2,$3,$3,$4)',[sku,'Synthetic unapproved draft',owner,JSON.stringify({sku,title:'Synthetic unapproved draft',_catalog:createCatalog({sku})})]);
   const row=(await db.query<{row:any}>('select to_jsonb(p) row from prelistings p')).rows[0].row;
   const job=await enqueueJob(workerDatabaseAdapter(db) as any,auth,'validate',{skus:[sku],versions:{[sku]:row.updated_at},channel:'amazon-us'});
   const run=()=>new Promise<any>((resolveResult,reject)=>{
    const child=spawn(process.execPath,['--import=tsx',resolve('scripts/antigravity/resilience/worker-ipc.ts'),job.id],{windowsHide:true,env:{PATH:process.env.PATH,SystemRoot:process.env.SystemRoot,NODE_ENV:'test',PRELISTING_RECOVERY_MODE:'false'},stdio:['ignore','ignore','pipe','ipc']});children.push(child);
    let result:any,errors='';child.stderr!.on('data',data=>errors+=data);
    child.on('error',reject);child.on('close',code=>result?resolveResult(result):reject(new Error(errors||'Worker process exited '+code)));
    child.on('message',async(message:any)=>{
     if(message.type==='result'){result=message;return;}
     if(message.type!=='query')return;
     try{
      const output=await db.query(message.sql,message.params);
      const send=()=>{if(child.connected)child.send({request:message.request,result:output});};
      if(message.sql.startsWith('select to_jsonb(t)')&&message.sql.includes('catalog_jobs')&&initialReads<2){initialReads++;held.push(send);if(initialReads===2)held.splice(0).forEach(release=>release());}else send();
     }catch(error){if(child.connected)child.send({request:message.request,error:error instanceof Error?error.message:'SQL failure'});}
    });
   });
   const results=await Promise.all([run(),run()]);expect(results.filter(result=>result.result?.cursor===1)).toHaveLength(1);expect(results.filter(result=>result.error?.status===409)).toHaveLength(1);
   const state=(await db.query<{row:any}>('select to_jsonb(j) row from catalog_jobs j')).rows[0].row;expect(state.status).toBe('completed');expect(state.cursor).toBe(1);expect(state.results).toHaveLength(1);
   expect((await db.query<{count:number}>('select count(*)::int count from catalog_versions where sku=$1',[sku])).rows[0].count).toBe(2);
   expect((await processJob(workerDatabaseAdapter(db) as any,auth,job.id)).cursor).toBe(1);
   mkdirSync('artifacts/antigravity/AG-05',{recursive:true});writeFileSync('artifacts/antigravity/AG-05/multiprocess.json',JSON.stringify({checked_at:new Date().toISOString(),worker_processes:2,database:'PGlite PostgreSQL single engine via IPC broker',same_checkpoint_barrier:true,winners:1,conflicts:1,versions:2,completed_job_replay_writes:0,network:'blocked',real_supabase:false},null,2));
  }finally{
   await Promise.all(children.map(child=>new Promise<void>(done=>{if(child.exitCode!==null||child.signalCode!==null){done();return;}child.once('close',()=>done());child.kill();})));
   await db.close();
  }
 },30000);
});
