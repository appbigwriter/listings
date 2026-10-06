import {evaluateCorpus,type EvaluationCase} from '../../../lib/ai/evaluation';
import {validateListing} from '../../../lib/catalog/contracts';
import {evaluateReadiness} from '../../../lib/catalog/readiness';
import {assertFamily} from '../../../lib/catalog/family';
import {hash,type ProductInput} from '../../../lib/catalog/model';
import type {AuthContext} from '../../../lib/auth';
import {validateChannelCopy} from '../../../lib/catalog/copy';

export type ContractCase={id:string;label:string;kind:'listing'|'readiness'|'family'|'copy';product:ProductInput;parent?:ProductInput;channel?:'amazon-us'|'ebay-us';expected:{valid?:boolean;required_codes?:string[];forbidden_codes?:string[]}};
export type Corpus={version:1;id:string;provenance:{source:'synthetic_contract_fixture';real_catalog_facts_verified:false};ai:EvaluationCase[];contracts:ContractCase[]};
export async function evaluateOffline(corpus:Corpus,now=Date.now()){
 if(corpus.version!==1||typeof corpus.id!=='string'||!corpus.id.trim()||corpus.provenance?.source!=='synthetic_contract_fixture'||corpus.provenance.real_catalog_facts_verified!==false||!Array.isArray(corpus.contracts)||corpus.contracts.length>5000||!Array.isArray(corpus.ai)||corpus.ai.some(item=>item.annotation?.source!=='synthetic_contract_fixture'))throw new Error('Corpus versionado sintético obrigatório.');
 const ids=new Set(corpus.ai.map(item=>item.id));
 const ai=evaluateCorpus(corpus.ai,now);
 const contracts=[];
 for(const item of corpus.contracts){
  if(typeof item.id!=='string'||!item.id.trim()||ids.has(item.id)||typeof item.label!=='string'||!item.label.trim()||!item.product||typeof item.product!=='object'||Array.isArray(item.product)||!item.expected||!['listing','readiness','family','copy'].includes(item.kind)||typeof item.expected.valid!=='boolean'||[item.expected.required_codes,item.expected.forbidden_codes].some(codes=>codes!==undefined&&(!Array.isArray(codes)||codes.some(code=>typeof code!=='string'||!code.trim())))||(item.channel!==undefined&&!['amazon-us','ebay-us'].includes(item.channel)))throw new Error('Contrato incompleto ou ID duplicado.');
  ids.add(item.id);let codes:string[]=[],valid=false;
  if(item.kind==='listing'){const result=validateListing(item.product);valid=result.valid;codes=result.errors;}
  else if(item.kind==='readiness'){const result=evaluateReadiness(item.product,'amazon-us',false);valid=result.ready;codes=result.issues.map(issue=>issue.code);}
  else if(item.kind==='copy'){try{validateChannelCopy(item.product,item.channel||'amazon-us');valid=true;}catch{codes=['channel_copy_rejected'];}}
  else {
   // Read-only local adapter: execute the actual family gate, never a remote query.
   let sku:unknown;const query={select(){return this;},eq(field:string,value:unknown){if(field==='sku')sku=value;return this;},neq(){return this;},async maybeSingle(){return {data:sku===item.parent?.sku?{sku,title:item.parent?.title,brand:item.parent?.brand,updated_at:'2026-10-06T00:00:00Z',payload:item.parent,status:'draft'}:null,error:null};}};
   const db={from(){return query;}};
   try{await assertFamily(db as never,{userId:'00000000-0000-4000-8000-000000000001',organizationId:'00000000-0000-4000-8000-000000000002'} as AuthContext,item.product,'amazon-us');valid=true;}catch{codes=['family_gate_rejected'];}
  }
  const passed=(item.expected.valid===undefined||item.expected.valid===valid)&&(item.expected.required_codes||[]).every(code=>codes.includes(code))&&!(item.expected.forbidden_codes||[]).some(code=>codes.includes(code));
  contracts.push({case_hash:hash(item.id),label:item.label,kind:item.kind,valid,codes,passed});
 }
 const total=ai.total+contracts.length,passed=ai.passed+contracts.filter(item=>item.passed).length;
 return {version:1,corpus_id:corpus.id,corpus_hash:hash(corpus),checked_at:new Date(now).toISOString(),live_model_executed:false,remote_calls:0,real_catalog_facts_verified:false,marketplace_homologated:false,total,passed,failed:total-passed,denominators:{saved_ai_outputs:ai.total,positive_ai_outputs:corpus.ai.filter(item=>item.expected.accepted).length,negative_ai_outputs:corpus.ai.filter(item=>!item.expected.accepted).length,listing_contracts:contracts.filter(item=>item.kind==='listing').length,readiness_contracts:contracts.filter(item=>item.kind==='readiness').length,family_contracts:contracts.filter(item=>item.kind==='family').length,copy_contracts:contracts.filter(item=>item.kind==='copy').length,human_qualified_catalog_cases:ai.qualified_catalog_cases},ai,contracts};
}
