import {CatalogError} from '../catalog/repository';
export type AiPricing={model:string;input_usd_per_million:number;output_usd_per_million:number;max_context_tokens:number;checked_at:string;source:string};
const known:AiPricing={model:'gpt-4o-mini',input_usd_per_million:0.15,output_usd_per_million:0.60,max_context_tokens:128000,checked_at:'2026-10-05T00:00:00Z',source:'https://developers.openai.com/api/docs/models/gpt-4o-mini'};
export function configuredAiPricing(model=process.env.OPENAI_MODEL||'gpt-4o-mini'):AiPricing|null {
  let pricing:AiPricing|null=model==='gpt-4o-mini'||model==='gpt-4o-mini-2024-07-18'?{...known,model}:null;
  if(process.env.PRELISTING_AI_PRICING_JSON)try{pricing=JSON.parse(process.env.PRELISTING_AI_PRICING_JSON);}catch{throw new CatalogError('Tabela de preços IA inválida.',503);}
  if(!pricing)return null;
  if(pricing.model!==model||![pricing.input_usd_per_million,pricing.output_usd_per_million].every(value=>typeof value==='number'&&Number.isFinite(value)&&value>0)||!Number.isSafeInteger(pricing.max_context_tokens)||pricing.max_context_tokens<5000||pricing.max_context_tokens>10000000||typeof pricing.source!=='string')throw new CatalogError('Tabela de preços IA não corresponde ao modelo ou contém valores inválidos.',503);
  const age=Date.now()-Date.parse(pricing.checked_at);if(!Number.isFinite(age)||age< -86400000||age>30*86400000)return null;
  return pricing;
}
export function costMicroUsd(pricing:AiPricing,promptTokens:number,completionTokens:number) {
  if(![promptTokens,completionTokens].every(value=>Number.isSafeInteger(value)&&value>=0))throw new CatalogError('Consumo de tokens inválido.',503);
  const cost=Math.ceil(promptTokens*pricing.input_usd_per_million+completionTokens*pricing.output_usd_per_million);
  if(!Number.isSafeInteger(cost))throw new CatalogError('Custo de IA acima do limite.',503);return cost;
}
export function aiOperationLimits(action:string) {
  if(action==='generate'||action==='prepare')return {calls:2,maxCompletionTokens:2500};
  if(action==='classify'||action==='research')return {calls:1,maxCompletionTokens:2500};
  throw new CatalogError('Ação IA inválida.');
}
export function reservationMicroUsd(pricing:AiPricing,action:string) {
  const limits=aiOperationLimits(action);
  // Reserve all context as input plus the full output allowance for every possible call.
  return costMicroUsd(pricing,pricing.max_context_tokens*limits.calls,limits.maxCompletionTokens*limits.calls);
}
export function dailyMicroUsd() {
  const value=process.env.PRELISTING_AI_DAILY_USD?.trim();if(!value)return null;
  if(!/^\d+(\.\d{1,6})?$/.test(value)||Number(value)<=0||Number(value)>10000)throw new CatalogError('Orçamento diário IA em USD inválido.',503);
  return Math.round(Number(value)*1000000);
}
