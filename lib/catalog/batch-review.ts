import type { SupabaseClient } from '@supabase/supabase-js';
import { hasCapability, type AuthContext } from '../auth';
import { type Channel, contentHash, isChannel } from './model';
import { evaluateReadiness } from './readiness';
import { CatalogError, loadProduct } from './repository';
import { assertFamily } from './family';
import { executeAction } from './executor';

export function reviewSelection(value:unknown):string[] {
  if(!Array.isArray(value)||!value.length||value.length>100||value.some(sku=>typeof sku!=='string'||!sku.trim())||new Set(value).size!==value.length)throw new CatalogError('Selecione de 1 a 100 SKUs diferentes por revisão.');
  return value;
}
export async function previewBatchReview(db:SupabaseClient,auth:AuthContext,skus:unknown,channel:Channel) {
  if(!isChannel(channel))throw new CatalogError('Canal inválido.');
  const items=[];
  for(const sku of reviewSelection(skus)) {
    const {product,row}=await loadProduct(db,auth,sku);
    const report=evaluateReadiness(product,channel,false);
    try{await assertFamily(db,auth,product,channel);}catch(error){if(!(error instanceof CatalogError))throw error;report.ready=false;report.issues.push({code:'family_review_required',field:'relationship',message:error.message,severity:'error',action:'Corrija a família antes de aprovar.'});}
    items.push({sku,product,report,expected_hash:contentHash(product,channel),updated_at:row.updated_at});
  }
  return items;
}
export async function approveBatchReview(db:SupabaseClient,auth:AuthContext,entries:unknown,channel:Channel,confirm:unknown) {
  if(!hasCapability(auth,'review')||confirm!==true)throw new CatalogError('Aprovação exige papel de revisor e confirmação explícita.',403);
  if(!Array.isArray(entries))throw new CatalogError('Revisões inválidas.');
  reviewSelection(entries.map(item=>item?.sku));
  if(!isChannel(channel)||entries.some(item=>typeof item.expected_hash!=='string'||!/^[a-f0-9]{64}$/.test(item.expected_hash)||typeof item.updated_at!=='string'||!Number.isFinite(Date.parse(item.updated_at))))throw new CatalogError('Informe a versão e o hash de cada produto revisado.');
  const outcomes=[];
  for(const item of entries) {
    try{await executeAction(db,auth,item.sku,'review',{channel,expected_hash:item.expected_hash,updated_at:item.updated_at});outcomes.push({sku:item.sku,status:'approved'});}
    catch(error){if(!(error instanceof CatalogError))throw error;outcomes.push({sku:item.sku,status:'blocked',error:error.message,code:error.status});}
  }
  return outcomes;
}
