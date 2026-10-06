import {describe,expect,it,vi,afterEach} from 'vitest';
const mocks=vi.hoisted(()=>({schema:vi.fn()}));
vi.mock('../lib/marketplaces/adapters',()=>({channelSchema:mocks.schema,categorySuggestions:vi.fn()}));
import {schemaChange} from '../lib/catalog/schema-change';
import {applyAction} from '../lib/catalog/actions';
import {createCatalog,hash,type SchemaSnapshot} from '../lib/catalog/model';
import {approveVersion,approvalValid} from '../lib/catalog/approval';
function schema(properties:Record<string,unknown>,required:string[],version:string):SchemaSnapshot {const schema={type:'object',properties,required};return {channel:'amazon-us',category:'sign',product_type:'SIGN',version,fetched_at:new Date().toISOString(),schema,checksum:hash(schema)};}
afterEach(()=>vi.restoreAllMocks());
describe('official schema refresh and drift',()=>{
 it('reports added/removed/changed/required fields and detects conditional-only changes',()=>{
  const before=schema({old:{type:'string'},color:{type:'string'}},[],'1'),after=schema({new:{type:'number'},color:{enum:['red']}},['new'],'2');
  expect(schemaChange(before,after)).toMatchObject({added_fields:['new'],removed_fields:['old'],changed_fields:['color'],new_required_fields:['new'],review_required:true});
  const conditional={...before,schema:{...before.schema,allOf:[{if:{required:['color']},then:{required:['old']}}]}};conditional.checksum=hash(conditional.schema);
  expect(schemaChange(before,conditional)).toMatchObject({review_required:true,conditional_changes_possible:true});
 });
 it('keeps approval on same schema refresh but invalidates it when official content changes',async()=>{
  const product={sku:'SCHEMA',title:'Sign',_catalog:createCatalog({sku:'SCHEMA'})},listing=product._catalog.channels['amazon-us']!;
  listing.product_type='SIGN';listing.category='sign';listing.schema=schema({},[],'1');listing.approval=approveVersion(product,'amazon-us','reviewer');
  mocks.schema.mockResolvedValue({...listing.schema,version:'2'});
  const same=await applyAction(product,{userId:'reviewer',organizationId:'org',mode:'local-only'},'schema');
  expect(approvalValid(same.product,'amazon-us')).toBe(true);expect(same.product._catalog!.channels['amazon-us']!.schema_change).toBeUndefined();
  mocks.schema.mockResolvedValue(schema({required_new:{type:'string'}},['required_new'],'3'));
  const changed=await applyAction(same.product,{userId:'reviewer',organizationId:'org',mode:'local-only'},'schema');
  expect(changed.product._catalog!.channels['amazon-us']!.approval).toBeUndefined();expect(changed.product._catalog!.channels['amazon-us']!.schema_change).toMatchObject({new_required_fields:['required_new']});
 });
});
