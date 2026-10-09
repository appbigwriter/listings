import type { SupabaseClient } from '@supabase/supabase-js';
import type { AuthContext } from '../auth';
import { CatalogError,scopeQuery } from '../catalog/repository';
import {configuredAiPricing,reservationMicroUsd,costMicroUsd,dailyMicroUsd,aiOperationLimits} from './cost';
import {traceEvent,traceSnapshot} from '../operations/trace';
export type Usage = { model:string; prompt_tokens:number; completion_tokens:number };
export type AiRuntime = { onUsage?:(usage:Usage)=>void;beforeCall?:(request:{model:string;max_completion_tokens?:number|null;messages:unknown;response_format?:unknown})=>void };
export async function reserveAiOperation(db:SupabaseClient,auth:AuthContext,sku:string,action:string) {
  const limit=Number(process.env.PRELISTING_AI_DAILY_OPERATIONS || 1000);
  if (!Number.isInteger(limit) || limit<1 || limit>10000) throw new CatalogError('Limite diário de IA inválido.',503);
  const operationLimits=aiOperationLimits(action);
  const pricing=configuredAiPricing(),daily=dailyMicroUsd();
  if(daily!==null&&!pricing)throw new CatalogError('Atualize a tabela de preços/contexto do modelo antes de usar o orçamento monetário.',503);
  const result=await db.rpc('reserve_catalog_ai_operation_cost',{p_owner:auth.userId,p_organization:auth.organizationId,p_sku:sku,p_action:action,p_limit:limit,p_daily_usd_micro:daily,p_reserved_usd_micro:pricing?reservationMicroUsd(pricing,action):0,p_pricing:pricing});
  if (result.error) throw new CatalogError('Não foi possível reservar o orçamento de IA.',503);
  if (!result.data) {
    const today = new Date().toISOString().slice(0, 10);
    const usage = await scopeQuery(db.from('catalog_ai_operations').select('status,reserved_usd_micro').eq('day', today).in('status', ['reserved', 'completed']), auth);
    const activeCount = usage.error ? limit : (usage.data || []).length;
    const reserved = usage.error ? Number.MAX_SAFE_INTEGER : (usage.data || []).reduce((sum: number, row: any) => sum + Number(row.reserved_usd_micro || 0), 0);
    if (activeCount >= limit) throw new CatalogError(`Limite diário de operações de IA atingido (${activeCount}/${limit}). Reduza o lote ou aumente PRELISTING_AI_DAILY_OPERATIONS.`, 429);
    if (daily !== null && reserved + (pricing ? reservationMicroUsd(pricing, action) : 0) > daily) throw new CatalogError(`Orçamento diário de IA atingido (${(reserved / 1000000).toFixed(2)} USD reservados). Ajuste PRELISTING_AI_DAILY_USD.`, 429);
    throw new CatalogError('Reserva de IA recusada. Consulte o estado operacional e tente novamente.', 429);
  }
  const trace=traceSnapshot({ai_operation_id:result.data});traceEvent('ai.reserved',{ai_operation_id:result.data});
  const calls:Usage[]=[];
  let started=0;
  return {runtime:{onUsage:(usage:Usage)=>{calls.push(usage);},beforeCall:(request:{model:string;max_completion_tokens?:number|null;messages:unknown;response_format?:unknown})=>{
    started++;
    if(started>operationLimits.calls||!Number.isInteger(request.max_completion_tokens)||Number(request.max_completion_tokens)>operationLimits.maxCompletionTokens||Number(request.max_completion_tokens)<1)throw new CatalogError('Chamada excede a reserva de IA.',503);
    const inputBytes=Buffer.byteLength(JSON.stringify({messages:request.messages,response_format:request.response_format}));
    if(pricing&&(request.model!==pricing.model||inputBytes>24000||inputBytes+8192+Number(request.max_completion_tokens)>pricing.max_context_tokens))throw new CatalogError('Modelo ou entrada excede o contexto reservado. Reduza os fatos/candidatos ou confira a tabela de preços.',422);
  }},finish:async(status:'completed'|'failed',failure?:unknown)=>{
    const estimated=pricing&&calls.length?calls.reduce((sum,call)=>sum+costMicroUsd(pricing,call.prompt_tokens,call.completion_tokens),0):null;
    const failureMessage=failure instanceof Error?failure.message:typeof failure==='string'?failure:'Falha sem diagnóstico.';
    const saved=await scopeQuery(db.from('catalog_ai_operations').update({status,estimated_usd_micro:estimated,usage:{trace,calls,prompt_tokens:calls.reduce((n,v)=>n+v.prompt_tokens,0),completion_tokens:calls.reduce((n,v)=>n+v.completion_tokens,0),cost_status:estimated===null?'unknown':'estimated_uncached_upper_rate',reservation_released:status==='failed',...(status==='failed'?{failure:failureMessage.slice(0,500)}:{})},updated_at:new Date().toISOString()}),auth).eq('id',result.data);
    if (saved.error) throw new CatalogError('Consumo de IA reservado; falha ao registrar uso. Consulte a operação antes de repetir.',503);
    traceEvent('ai.finished',{ai_operation_id:result.data,state:status,prompt_tokens:calls.reduce((n,v)=>n+v.prompt_tokens,0),completion_tokens:calls.reduce((n,v)=>n+v.completion_tokens,0)});
  }};
}
