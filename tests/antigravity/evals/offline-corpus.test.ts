import {describe,it,expect,vi} from 'vitest';
import corpus from '../../../evals/antigravity/corpus-v1.json';
import {evaluateOffline,type Corpus} from '../../../scripts/antigravity/evals/evaluate';

describe('AG-03 saved-output and catalog contract corpus',()=>{
 it('executes all annotated synthetic cases without provider/network and explains denominators',async()=>{
  const network=vi.spyOn(globalThis,'fetch').mockRejectedValue(new Error('Offline only'));
  try{
   const result=await evaluateOffline(corpus as Corpus,Date.parse('2026-10-06T12:00:00Z'));
   expect(result).toMatchObject({total:47,passed:47,failed:0,live_model_executed:false,remote_calls:0,real_catalog_facts_verified:false,marketplace_homologated:false});
   expect(result.denominators).toEqual({saved_ai_outputs:18,positive_ai_outputs:5,negative_ai_outputs:13,listing_contracts:9,readiness_contracts:5,family_contracts:5,copy_contracts:10,human_qualified_catalog_cases:0});
   expect(result.ai.false_acceptances).toBe(0);expect(result.ai.qualified_for_quality_review).toBe(false);expect(network).not.toHaveBeenCalled();
  }finally{network.mockRestore();}
 });
 it('records incorrect annotations as actual failures rather than omitting them',async()=>{
  const changed=structuredClone(corpus) as Corpus;changed.ai[0].expected.accepted=false;
  const result=await evaluateOffline(changed);
  expect(result.failed).toBe(1);expect(result.ai.false_acceptances).toBe(1);expect(result.total).toBe(47);
 });
 it('rejects duplicate IDs across suites and inaccurate provenance declarations',async()=>{
  const duplicate=structuredClone(corpus) as Corpus;duplicate.contracts[0].id=duplicate.ai[0].id;
  await expect(evaluateOffline(duplicate)).rejects.toThrow();
  const falseSource=structuredClone(corpus) as Corpus;(falseSource.provenance as any).real_catalog_facts_verified=true;
  await expect(evaluateOffline(falseSource)).rejects.toThrow();
  const inventedReviewer=structuredClone(corpus) as Corpus;inventedReviewer.ai[0].annotation={source:'human_reviewed_catalog',reviewer:'invented',reviewed_at:new Date().toISOString()};
  await expect(evaluateOffline(inventedReviewer)).rejects.toThrow();
  const missingExpectation=structuredClone(corpus) as Corpus;missingExpectation.contracts[0].expected={};
  await expect(evaluateOffline(missingExpectation)).rejects.toThrow();
 });
});
