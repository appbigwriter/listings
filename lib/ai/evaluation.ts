import {hash} from '../catalog/model';
import {validateAiInput,validateAiListingResponse,type AiGenerationInput} from './contracts';
import {validGrounding} from './grounding';
export type EvaluationCase={id:string;input:AiGenerationInput;output:unknown;audit:unknown;expected:{accepted:boolean;category_ids?:string[];forbidden_claims?:string[]};category?:{id:string;confidence:number;reason:string};candidates?:{id:string;name:string}[];annotation:{source:'synthetic_contract_fixture'|'human_reviewed_catalog';reviewer?:string;reviewed_at?:string}};

export function evaluateCorpus(cases:EvaluationCase[],now=Date.now()){
 if(!Array.isArray(cases)||!cases.length||cases.length>5000)throw new Error('Corpus deve conter entre 1 e 5.000 casos.');
 const seen=new Set<string>();
 const results=cases.map(item=>{
  if(!item||typeof item.id!=='string'||!item.id.trim()||seen.has(item.id)||typeof item.expected?.accepted!=='boolean'||!['synthetic_contract_fixture','human_reviewed_catalog'].includes(item.annotation?.source)||!validateAiInput(item.input).ok)throw new Error('Caso incompleto, duplicado ou fora do contrato.');
  seen.add(item.id);
  if(item.expected.forbidden_claims?.some(claim=>typeof claim!=='string'||!claim.trim()))throw new Error('Anotações de claims inválidas.');
  const reasons:string[]=[],grounded=validGrounding(item.audit,item.input),contract=validateAiListingResponse(item.output,item.input,grounded);
  if(!grounded)reasons.push('grounding_invalid');if(!contract.ok)reasons.push(contract.error);
  const draft=item.output&&typeof item.output==='object'?Object.values(item.output).filter(value=>typeof value==='string').join('\n').toLowerCase():'';
  if(item.expected.forbidden_claims?.some(claim=>draft.includes(claim.toLowerCase())))reasons.push('annotated_unsupported_claim');
  if(item.category){
   if(!item.candidates?.some(candidate=>candidate.id===item.category!.id)||!Number.isFinite(item.category.confidence)||item.category.confidence<0||item.category.confidence>1||typeof item.category.reason!=='string'||!item.category.reason.trim())reasons.push('category_outside_contract');
   if(item.expected.category_ids&&!item.expected.category_ids.includes(item.category.id))reasons.push('category_annotation_mismatch');
  }else if(item.expected.category_ids?.length)reasons.push('category_missing');
  const accepted=reasons.length===0,reviewedAt=Date.parse(item.annotation.reviewed_at||'');
  const qualified=item.annotation.source==='human_reviewed_catalog'&&Boolean(item.annotation.reviewer?.trim())&&Number.isFinite(reviewedAt)&&reviewedAt<=now+300000;
  return {case_hash:hash(item.id),input_hash:hash(item.input),output_hash:hash(item.output),accepted,expected_accepted:item.expected.accepted,passed:accepted===item.expected.accepted,reasons,qualified};
 });
 const positive=results.filter(item=>item.expected_accepted),negative=results.filter(item=>!item.expected_accepted);
 return {version:1,checked_at:new Date(now).toISOString(),scope:'saved_outputs_and_annotations',live_model_executed:false,total:results.length,passed:results.filter(item=>item.passed).length,failed:results.filter(item=>!item.passed).length,false_acceptances:negative.filter(item=>item.accepted).length,false_rejections:positive.filter(item=>!item.accepted).length,qualified_catalog_cases:results.filter(item=>item.qualified).length,qualified_for_quality_review:results.every(item=>item.qualified),marketplace_homologated:false,results};
}
