import type {SupabaseClient} from '@supabase/supabase-js';
import type {AuthContext} from '../auth';
import {CatalogError,scopeQuery} from './repository';
export function startJobLease(db:SupabaseClient,auth:AuthContext,id:string,token:string){
 let stopped=false,lost=false,flight:Promise<void>|null=null;
 const scope=(query:any)=>scopeQuery(query,auth).eq('id',id).eq('status','running').eq('lease_token',token).gt('lease_until',new Date().toISOString());
 async function renew(){
  if(stopped||lost||flight)return;
  flight=(async()=>{try{
   const result=await scope(db.from('catalog_jobs').update({lease_until:new Date(Date.now()+180000).toISOString(),updated_at:new Date().toISOString()})).select('id').abortSignal(AbortSignal.timeout(10000)).maybeSingle();
   if(result.error||!result.data)lost=true;
  }catch{lost=true;}})();
  try{await flight;}finally{flight=null;}
 }
 const timer=setInterval(()=>{void renew();},45000);timer.unref?.();
 return {
  async assert(){
   await flight;if(lost||stopped)throw new CatalogError('Worker perdeu a reserva durante a operação. Consulte o lote antes de continuar.',409);
   const result=await scope(db.from('catalog_jobs').select('id')).abortSignal(AbortSignal.timeout(10000)).maybeSingle();
   if(result.error||!result.data){lost=true;throw new CatalogError('Reserva expirada, cancelada ou transferida; resultado não será salvo por este worker.',409);}
  },
  async close(){stopped=true;clearInterval(timer);await flight;},
 };
}
