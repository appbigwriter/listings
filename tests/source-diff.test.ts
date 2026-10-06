import {describe,expect,it} from 'vitest';
import {sourceDiff,stageSourceUpdate} from '../lib/catalog/source-diff';
import {normalizeImportedProduct} from '../lib/catalog/import';
describe('source change and removal review',()=>{
  it('stages a server-owned source change without overwriting facts and removes every old approval',()=>{
    const current=normalizeImportedProduct({sku:'FBR-SOURCE',title:'Existing sign',material:'Steel'},'configured');current.human_reviewed=true;current._catalog!.channels['amazon-us']!.approval={hash:'old',actor:'reviewer',approved_at:'then'};current._catalog!.facts.material.status='confirmed';
    const incoming=normalizeImportedProduct({sku:'FBR-SOURCE',title:'Changed sign',material:'Aluminum'},'configured');
    const staged=stageSourceUpdate(current,incoming._catalog!.source);
    expect(staged.title).toBe(current.title);expect(staged.material).toBe('Steel');expect(staged.source_update).toEqual(incoming._catalog!.source);expect(staged._catalog!.source).toEqual(current._catalog!.source);expect(staged._catalog!.facts.material.status).toBe('confirmed');expect(staged.human_reviewed).toBe(false);expect(staged._catalog!.channels['amazon-us']!.approval).toBeUndefined();expect(current._catalog!.channels['amazon-us']!.approval).toBeDefined();
  });
  it('compares snapshots without overwriting facts and flags removals only from a complete source',()=>{
    const incoming=[normalizeImportedProduct({sku:'A',title:'Sign'},'loja-configurada'),normalizeImportedProduct({sku:'C',title:'New'},'loja-configurada')];
    const existing=[{sku:'A',source:{id:'configured',hash:'old'}},{sku:'B',source:{id:'loja-configurada',hash:'old'}},{sku:'OTHER',source:{id:'arquivo',hash:'old'}}];
    const result=sourceDiff(incoming,existing,'loja-configurada',true);
    expect(result.items).toEqual([{sku:'A',status:'changed'},{sku:'C',status:'new'}]);expect(result.absent).toEqual(['B']);expect(result.removal_action).toBe('review_only');
    expect(sourceDiff(incoming,existing,'loja-configurada',false).absent).toEqual([]);
    expect(incoming[0].human_reviewed).toBe(false);
  });
  it('keeps an unchanged source distinct from reviewed product edits',()=>{
    const product=normalizeImportedProduct({sku:'A',title:'Source'},'loja-configurada');
    expect(sourceDiff([product],[{sku:'A',source:{id:'loja-configurada',hash:product._catalog!.source!.hash}}],'loja-configurada',true).items[0].status).toBe('unchanged');
  });
});
