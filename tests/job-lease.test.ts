import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {startJobLease} from '../lib/catalog/job-lease';
const auth={userId:'owner',organizationId:'org',mode:'supabase-session' as const};
function database(){
 let valid=true;const filters:any[]=[],updates:any[]=[],signals:AbortSignal[]=[];
 const query:any={eq:(...args:any[])=>{filters.push(args);return query;},gt:(...args:any[])=>{filters.push(args);return query;},select:()=>query,abortSignal:(signal:AbortSignal)=>{signals.push(signal);return query;},maybeSingle:async()=>({data:valid?{id:'job'}:null,error:null})};
 const db:any={from:()=>({...query,update:(values:any)=>{updates.push(values);return query;}})};
 return {db,filters,updates,signals,invalidate:()=>{valid=false;}};
}
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(Date.parse('2026-10-06T03:00:00Z'));});
afterEach(()=>vi.useRealTimers());
describe('worker lease heartbeat and ownership before persistence',()=>{
 it('renews long preparation operations with owner/org/token/status/expiry guards and cleans up its timer',async()=>{
  const {db,filters,updates,signals}=database(),lease=startJobLease(db,auth,'job','token');
  await vi.advanceTimersByTimeAsync(45000);expect(updates).toHaveLength(1);expect(updates[0].lease_until).toBe('2026-10-06T03:03:45.000Z');
  for(const filter of [['owner_id','owner'],['organization_id','org'],['id','job'],['status','running'],['lease_token','token']])expect(filters).toContainEqual(filter);
  expect(filters).toContainEqual(['lease_until','2026-10-06T03:00:45.000Z']);expect(signals[0]).toBeInstanceOf(AbortSignal);
  await lease.assert();await lease.close();await vi.advanceTimersByTimeAsync(90000);expect(updates).toHaveLength(1);
 });
 it('fails closed after cancellation or a competing worker without renewing the lost reservation',async()=>{
  const {db,invalidate,updates}=database(),lease=startJobLease(db,auth,'job','token');invalidate();
  await vi.advanceTimersByTimeAsync(45000);await expect(lease.assert()).rejects.toMatchObject({status:409});
  await vi.advanceTimersByTimeAsync(90000);expect(updates).toHaveLength(1);await lease.close();
 });
 it('checks expiry/ownership before saving even when no heartbeat interval has elapsed',async()=>{
  const {db,invalidate,updates}=database(),lease=startJobLease(db,auth,'job','token');invalidate();
  await expect(lease.assert()).rejects.toThrow('não será salvo');expect(updates).toHaveLength(0);await lease.close();
 });
});
