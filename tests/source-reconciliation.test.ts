import {describe,it,expect} from 'vitest';
import {normalizeImportedProduct} from '../lib/catalog/import';
import {stageSourceUpdate} from '../lib/catalog/source-diff';
import {mergeDraft} from '../lib/catalog/repository';
import {reconcileSource} from '../lib/catalog/source-reconciliation';
import {hash} from '../lib/catalog/model';
const row={sku:'SOURCE-001',title:'Original sign',price:20,qty:2,material:'Steel'};
const current=()=>normalizeImportedProduct(row,'store');
describe('field provenance and audited source reconciliation',()=>{
 it('preserves human authority and values when staging new source observations',()=>{
  const manual=mergeDraft(current(),{title:'Reviewed title',price:25},'operator');
  const incoming=normalizeImportedProduct({...row,title:'Source title',price:22},'store');
  const staged=stageSourceUpdate(manual,incoming._catalog!.source);
  expect(staged.title).toBe('Reviewed title');expect(staged.price).toBe(25);
  expect(staged._catalog!.field_sources!.title).toMatchObject({authority:'human',actor:'operator',value_hash:hash('Reviewed title')});
  expect(staged._catalog!.field_sources!.material).toMatchObject({authority:'source',source_id:'store',source_hash:hash(row)});
 });
 it('audits selected and retained differences and reopens technical confirmation',()=>{
  const product=current();product._catalog!.facts.material.status='confirmed';
  const incoming=normalizeImportedProduct({...row,title:'New title',price:30,material:'Aluminum'},'store');
  const staged=stageSourceUpdate(product,incoming._catalog!.source);
  reconcileSource(staged,'operator',{fields:['material'],reason:'Use updated specification; preserve reviewed offer and copy.'});
  expect(staged.material).toBe('Aluminum');expect(staged.price).toBe(20);expect(staged.title).toBe(row.title);
  expect(staged._catalog!.facts.material).toMatchObject({value:'Aluminum',source:'store',status:'pending'});
  expect(staged._catalog!.field_sources!.material).toMatchObject({authority:'source',actor:'operator',source_hash:incoming._catalog!.source!.hash});
  expect(staged.source_resolution).toMatchObject({applied_fields:['material'],retained_fields:expect.arrayContaining(['title','price']),actor:'operator',source_hash:incoming._catalog!.source!.hash,previous_source_hash:hash(row)});
  expect(staged.source_update).toBeUndefined();expect(product.material).toBe('Steel');
 });
 it('requires a decision reason and rejects mismatched identities, forged snapshots and invalid fields',()=>{
  const incoming=normalizeImportedProduct({...row,price:21},'store');
  const product=()=>stageSourceUpdate(current(),incoming._catalog!.source);
  expect(()=>reconcileSource(product(),'operator',{fields:['price']})).toThrow('motivo');
  for(const fields of [['_catalog'],['sku'],['price','price']])expect(()=>reconcileSource(product(),'operator',{fields,reason:'Reviewed'})).toThrow('distintos');
  const wrong=stageSourceUpdate(current(),normalizeImportedProduct({...row,sku:'OTHER'},'store')._catalog!.source);
  expect(()=>reconcileSource(wrong,'operator',{keep_current:true,reason:'Reviewed'})).toThrow('identidade');
  const forged=product();(forged.source_update as any).snapshot.price=999;
  expect(()=>reconcileSource(forged,'operator',{keep_current:true,reason:'Reviewed'})).toThrow('íntegro');
 });
 it('retains current values with reason and does not turn source data into confirmed facts',()=>{
  const incoming=normalizeImportedProduct({...row,material:'Plastic'},'store');
  const product=stageSourceUpdate(current(),incoming._catalog!.source);
  reconcileSource(product,'operator',{keep_current:true,reason:'Manufacturer confirms original steel specification.'});
  expect(product.material).toBe('Steel');expect(product._catalog!.facts.material.status).toBe('pending');
  expect(product.source_resolution).toMatchObject({decision:'keep_current',reason:'Manufacturer confirms original steel specification.',applied_fields:[],retained_fields:expect.arrayContaining(['material'])});
  expect(mergeDraft(product,{source_resolution:{actor:'forged'},_catalog:{field_sources:{material:{authority:'human'}}}},'operator').source_resolution).toEqual(product.source_resolution);
 });
});
