import {describe,expect,it} from 'vitest';
import {evaluateCorpus,type EvaluationCase} from '../lib/ai/evaluation';
import {validGrounding} from '../lib/ai/grounding';
const input={fbrFacts:{title:'Steel sign',material:'Steel'}},output={title:'Steel sign',material:'Steel'},audit={supported:true,reason:'Copied supplied facts',evidence:[{field:'title',quote:'Steel sign'}]};
const sample:EvaluationCase={id:'synthetic-1',input,output,audit,expected:{accepted:true},annotation:{source:'synthetic_contract_fixture'}};
describe('saved-output AI evaluation',()=>{
 it('distinguishes synthetic contract checks from qualified quality evidence and reports false acceptances',()=>{
  expect(evaluateCorpus([sample])).toMatchObject({passed:1,qualified_for_quality_review:false,live_model_executed:false});
  expect(evaluateCorpus([{...sample,expected:{accepted:false}}])).toMatchObject({failed:1,false_acceptances:1});
  expect(evaluateCorpus([{...sample,annotation:{source:'human_reviewed_catalog',reviewer:'reviewer',reviewed_at:new Date().toISOString()}}])).toMatchObject({qualified_catalog_cases:1,qualified_for_quality_review:true,marketplace_homologated:false});
 });
 it('rejects unsupported measurements, copied reference claims and category outside official candidates',()=>{
  for(const modified of [{output:{...output,title:'Steel sign 99 inches'}},{input:{...input,referenceData:{claim:'Guaranteed safety'}},output:{...output,description:'Guaranteed safety'}},{category:{id:'invented',confidence:1,reason:'chosen'},candidates:[{id:'actual',name:'Signs'}]}])expect(evaluateCorpus([{...sample,...modified,expected:{accepted:false}}]).passed).toBe(1);
 });
 it('detects explicitly annotated claims and rejects malformed/duplicate corpus',()=>{
  expect(evaluateCorpus([{...sample,output:{...output,description:'Certified waterproof'},expected:{accepted:false,forbidden_claims:['waterproof']}}]).results[0].reasons).toContain('annotated_unsupported_claim');
  expect(()=>evaluateCorpus([sample,sample])).toThrow();expect(()=>evaluateCorpus([])).toThrow();expect(()=>evaluateCorpus([{...sample,expected:{} as any}])).toThrow();
 });
 it('rejects forged and malformed grounding without coercing nulls or object quotes',()=>{
  for(const evidence of [[null],[{field:'title',quote:{}}],[{field:'missing',quote:'Steel'}],[{field:'title',quote:'  '}],[{field:'title',quote:'False'}]])expect(validGrounding({...audit,evidence},input)).toBe(false);
  expect(validGrounding(audit,input)).toBe(true);
 });
});
