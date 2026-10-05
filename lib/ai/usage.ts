import type { SupabaseClient } from '@supabase/supabase-js';
import type { AuthContext } from '../auth';
import { CatalogError,scopeQuery } from '../catalog/repository';
export type Usage = { model:string; prompt_tokens:number; completion_tokens:number };
export type AiRuntime = { onUsage?:(usage:Usage)=>void };
export async function reserveAiOperation(db:SupabaseClient,auth:AuthContext,sku:string,action:string) {
  const limit=Number(process.env.PRELISTING_AI_DAILY_OPERATIONS || 200);
  if (!Number.isInteger(limit) || limit<1 || limit>10000) throw new CatalogError('Limite diário de IA inválido.',503);
  const result=await db.rpc('reserve_catalog_ai_operation',{p_owner:auth.userId,p_organization:auth.organizationId,p_sku:sku,p_action:action,p_limit:limit});
  if (result.error) throw new CatalogError('Não foi possível reservar o orçamento de IA.',503);
  if (!result.data) throw new CatalogError('Limite diário de operações de IA atingido. Ajuste o orçamento ou aguarde o próximo dia UTC.',429);
  const calls:Usage[]=[];
  return {runtime:{onUsage:(usage:Usage)=>{calls.push(usage);}},finish:async(status:'completed'|'failed')=>{
    const saved=await scopeQuery(db.from('catalog_ai_operations').update({status,usage:{calls,prompt_tokens:calls.reduce((n,v)=>n+v.prompt_tokens,0),completion_tokens:calls.reduce((n,v)=>n+v.completion_tokens,0)},updated_at:new Date().toISOString()}),auth).eq('id',result.data);
    if (saved.error) throw new CatalogError('Consumo de IA reservado; falha ao registrar uso. Consulte a operação antes de repetir.',503);
  }};
}
