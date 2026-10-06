import {describe,expect,it} from 'vitest';
import {applyAction} from '../../../lib/catalog/actions';
import {approvalValid} from '../../../lib/catalog/approval';
import {contentHash,createCatalog,hash,TECHNICAL_FIELDS,type ProductInput} from '../../../lib/catalog/model';
import {evaluateReadiness} from '../../../lib/catalog/readiness';
import {mergeDraft} from '../../../lib/catalog/repository';
import {ebayAdvancedAspectSchema,type EbayTaxonomyAspects} from '../../../lib/marketplaces/ebay-advanced-aspects';
const date=new Date().toISOString(),auth={userId:'fixture-reviewer',organizationId:'fixture-org',mode:'local-only' as const};
function fixture(parent:boolean):ProductInput{
 const taxonomy:EbayTaxonomyAspects={aspects:[{localizedAspectName:'Color',aspectConstraint:{aspectRequired:true,aspectMode:'SELECTION_ONLY',aspectDataType:'STRING',itemToAspectCardinality:'SINGLE',aspectEnabledForVariations:true},aspectValues:[{localizedValue:'Red'},{localizedValue:'Blue'}]},{localizedAspectName:'Material',aspectConstraint:{aspectRequired:true,aspectMode:'FREE_TEXT',aspectDataType:'STRING',itemToAspectCardinality:'SINGLE',aspectEnabledForVariations:false}}]};
 const product:ProductInput={sku:parent?'GROUP':'RED',relationship:parent?'Parent':'Child',parent_sku:parent?undefined:'GROUP',title:'Safety sign',description:'Measured aluminum safety sign',brand:'FBRSigns',origin:'US',material:'Aluminum',mpn:parent?undefined:'SIGN-RED',price:12,qty:0,currency:'USD',images:['https://example.com/sign.jpg'],pkg_length:10,pkg_width:8,pkg_height:1,pkg_weight:1,ebay_condition:'NEW',ebay_location:'location',ebay_payment_policy:'1',ebay_return_policy:'2',ebay_fulfillment_policy:'3',assets_reviewed:true,policy_reviewed:true,_catalog:createCatalog({})};
 const catalog=product._catalog!;catalog.kind='physical';catalog.eligibility_confirmed=true;catalog.media=[{url:'https://example.com/sign.jpg',checked_at:date,width:1000,height:1000,format:'jpeg',sha256:'a'.repeat(64)}];
 const attributes={Material:['Aluminum'],...(!parent?{Color:['Red']}:{})},schema=ebayAdvancedAspectSchema(taxonomy);
 catalog.channels['ebay-us']={category:'123',product_type:'SIGN',attributes,...(parent?{family:{variation_aspects:['Color'],image_variation_aspect:'Color'}}:{}),schema:{channel:'ebay-us',category:'123',product_type:'SIGN',schema,checksum:hash(schema),version:'fixture-version',fetched_at:date,metadata:{category_tree_id:'0',taxonomy}}};
 for(const field of TECHNICAL_FIELDS)if(product[field]!==undefined)catalog.facts[field]={value:product[field],status:'confirmed',source:'synthetic isolated test only',observed_at:date};
 for(const [name,value] of Object.entries(attributes))catalog.facts[`ebay.aspect.${name}`]={value,status:'confirmed',source:'synthetic isolated test only',observed_at:date};
 return product;
}
describe('actual family core actions/readiness retain review and fact guards',()=>{
 it('approves Parent without variable attributes and Child with proven variable values',async()=>{
  for(const parent of [true,false]){const product=fixture(parent);expect(evaluateReadiness(product,'ebay-us',false).issues).toEqual([]);const result=await applyAction(product,auth,'review',{channel:'ebay-us',expected_hash:contentHash(product,'ebay-us')});expect(approvalValid(result.product,'ebay-us')).toBe(true);}
 });
 it('requires aspect provenance before review and keeps unverified facts from becoming approved',async()=>{
  const product=fixture(false);delete product._catalog!.facts['ebay.aspect.Color'];
  expect(evaluateReadiness(product,'ebay-us',false).ready).toBe(false);
  await expect(applyAction(product,auth,'review',{channel:'ebay-us',expected_hash:contentHash(product,'ebay-us')})).rejects.toThrow();
 });
 it('confirms only saved category aspects, invalidates review on value changes, and rejects foreign field names',async()=>{
  const product=fixture(false);delete product._catalog!.facts['ebay.aspect.Color'];
  const confirmed=await applyAction(product,auth,'confirm-facts',{channel:'ebay-us',fields:['ebay.aspect.Color'],source:'fixture material sheet'});
  expect(confirmed.product._catalog!.facts['ebay.aspect.Color']).toMatchObject({value:['Red'],status:'confirmed'});
  const reviewed=await applyAction(confirmed.product,auth,'review',{channel:'ebay-us',expected_hash:contentHash(confirmed.product,'ebay-us')});
  const changed=await applyAction(reviewed.product,auth,'configure',{channel:'ebay-us',attributes:{Material:['Aluminum'],Color:['Blue']}});expect(approvalValid(changed.product,'ebay-us')).toBe(false);expect(evaluateReadiness(changed.product,'ebay-us',false).ready).toBe(false);
  await expect(applyAction(product,auth,'confirm-facts',{channel:'ebay-us',fields:['ebay.aspect.Invented'],source:'fixture sheet'})).rejects.toThrow();
 });
 it('preserves unchanged saved aspect attestations during ordinary product edits',()=>{
  const product=fixture(false),changed=mergeDraft(product,{qty:2},'fixture-editor');
  expect(changed._catalog!.facts['ebay.aspect.Color']).toMatchObject({value:['Red'],status:'confirmed'});
  expect(changed._catalog!.facts['ebay.aspect.Material']).toMatchObject({value:['Aluminum'],status:'confirmed'});
 });
 it('binds review hashes to taxonomy metadata and configured axes',()=>{
  const parent=fixture(true),before=contentHash(parent,'ebay-us');parent._catalog!.channels['ebay-us']!.schema!.metadata!.taxonomy.aspects[0].aspectConstraint.aspectEnabledForVariations=false;
  expect(contentHash(parent,'ebay-us')).not.toBe(before);expect(evaluateReadiness(parent,'ebay-us',false).ready).toBe(false);
 });
 it('can review parent common aspects conditional on a variable axis that belongs only to children',()=>{
  const parent=fixture(true),listing=parent._catalog!.channels['ebay-us']!,taxonomy=listing.schema!.metadata!.taxonomy;
  taxonomy.aspects[1].aspectConstraint.aspectMode='SELECTION_ONLY';taxonomy.aspects[1].aspectValues=[{localizedValue:'Aluminum',valueConstraints:[{applicableForLocalizedAspectName:'Color',applicableForLocalizedAspectValues:['Red','Blue']}]}];
  listing.schema!.schema=ebayAdvancedAspectSchema(taxonomy);listing.schema!.checksum=hash(listing.schema!.schema);
  const result=evaluateReadiness(parent,'ebay-us',false);expect(result.issues).toEqual([]);
 });
});
