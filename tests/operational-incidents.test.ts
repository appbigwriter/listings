import {describe,expect,it} from 'vitest';
import {createIsolatedTestDatabase} from './antigravity/fixtures/mock-db-helper';
import {evaluateIncidents,reconcileIncidents} from '../lib/operations/incidents';
const owner='00000000-0000-4000-8000-000000000001',org='00000000-0000-4000-8000-000000000002',id='00000000-0000-4000-8000-000000000003';
describe('durable actionable incidents',()=>{
 it('deduplicates unchanged incidents, resolves, reopens once, rejects stale evaluations and protects grants/scope',async()=>{
  const db=await createIsolatedTestDatabase();try{
   const observed=new Date().toISOString(),incident={fingerprint:'a'.repeat(64),rule:'submission_uncertain',entity_id:id,channel:'amazon-us'};
   const evaluate=async(items:any[],date=observed,user=owner)=>(await db.query<{result:any}>('select public.reconcile_catalog_incidents($1::uuid,$2::uuid,$3::timestamptz,$4::jsonb) as result',[user,org,date,JSON.stringify(items)])).rows[0].result;
   expect(await evaluate([incident])).toMatchObject({opened:1,active:1});expect(await evaluate([incident])).toMatchObject({opened:0,active:1});
   expect(await evaluate([])).toMatchObject({resolved:1});expect(await evaluate([incident])).toMatchObject({opened:1});
   expect((await db.query<{occurrences:number}>('select occurrences from public.catalog_incidents')).rows[0].occurrences).toBe(2);
   await expect(evaluate([],new Date(Date.parse(observed)-1000).toISOString())).rejects.toThrow('Stale');
   expect(await evaluate([],observed,id)).toMatchObject({resolved:0});
   await db.exec(`set role authenticated; set request.jwt.claims='${JSON.stringify({sub:id,app_metadata:{organization_id:org}})}'`);
   expect((await db.query('select * from public.catalog_incidents')).rows).toHaveLength(0);
   await expect(evaluate([incident])).rejects.toThrow('permission denied');await db.exec('reset role');
  }finally{await db.close();}
 },20000);
 it('creates actionable rules only after thresholds and emits no payload/PII',()=>{
  const now=Date.now(),old=new Date(now-1000000).toISOString(),snapshot={jobs:[{id,status:'pending',updated_at:old,next_attempt_at:old}],submissions:[{id,status:'unknown',channel:'amazon-us',payload:{secret:'TOKEN'}}],feeds:[],events:[],products:[]};
  expect(evaluateIncidents(snapshot,now).map(item=>item.rule)).toEqual(['queue_stalled','submission_uncertain']);expect(JSON.stringify(evaluateIncidents(snapshot,now))).not.toContain('TOKEN');
  snapshot.jobs[0].next_attempt_at=new Date(now+1000).toISOString();expect(evaluateIncidents(snapshot,now)).toHaveLength(1);
 });
 it('does not resolve incidents when any source population is incomplete or unavailable',async()=>{
  const rpc=()=>{throw new Error('must not reconcile');},query:any={select:()=>query,eq:()=>query,in:()=>query,neq:()=>query,order:()=>query,range:async()=>({data:[],count:2,error:null})};
  await expect(reconcileIncidents({from:()=>query,rpc},{userId:owner,organizationId:org,mode:'supabase-session'})).rejects.toThrow('incompleta');
 });
});
