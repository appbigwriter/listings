import {describe,expect,it} from 'vitest';
import {approveVersion} from '../../../lib/catalog/approval';
import {createCatalog,hash,TECHNICAL_FIELDS,type ProductInput} from '../../../lib/catalog/model';
import {assertEbayFamilyVersion,buildEbayFamilyPackage,type EbayFamilyInput,type EbayFamilyItem} from '../../../lib/marketplaces/ebay-family-package';
import {ebayAdvancedAspectSchema,validateEbayAdvancedAspects,type EbayTaxonomyAspects} from '../../../lib/marketplaces/ebay-advanced-aspects';

const now=Date.now(),date=new Date(now).toISOString();
const taxonomy=():EbayTaxonomyAspects=>({aspects:[
 {localizedAspectName:'Color',aspectConstraint:{aspectRequired:true,aspectMode:'SELECTION_ONLY',aspectDataType:'STRING',itemToAspectCardinality:'SINGLE',aspectEnabledForVariations:true},aspectValues:[{localizedValue:'Red'},{localizedValue:'Blue'}]},
 {localizedAspectName:'Material',aspectConstraint:{aspectRequired:true,aspectMode:'FREE_TEXT',aspectDataType:'STRING',itemToAspectCardinality:'SINGLE',aspectEnabledForVariations:false}},
]});
function item(sku:string,relationship:string,color?:string):EbayFamilyItem {
 const product:ProductInput={sku,relationship,parent_sku:relationship==='Child'?'GROUP':undefined,title:'Safety Sign',description:'Real specification <checked>',brand:'FBRSigns',origin:'US',material:'Aluminum',gtin:'012345678905',id_type:'UPC',qty:'0',price:'12.50',currency:'USD',images:['https://example.com/sign.jpg'],pkg_length:10,pkg_width:8,pkg_height:1,pkg_weight:1,ebay_condition:'NEW',ebay_location:'location',ebay_payment_policy:'1',ebay_return_policy:'2',ebay_fulfillment_policy:'3',assets_reviewed:true,policy_reviewed:true,_catalog:createCatalog({})};
 const catalog=product._catalog!;catalog.kind='physical';catalog.eligibility_confirmed=true;
 const attributes={Material:['Aluminum'],...(color?{Color:[color]}:{})},schema=ebayAdvancedAspectSchema(taxonomy());
 catalog.channels['ebay-us']={product_type:'SIGN',category:'123',attributes,schema:{channel:'ebay-us',product_type:'SIGN',category:'123',version:'test-tree-version',fetched_at:date,schema,checksum:hash(schema)}};
 for(const field of TECHNICAL_FIELDS)if(product[field]!==undefined)catalog.facts[field]={value:product[field],status:'confirmed',source:'synthetic fixture; not a real product attestation',observed_at:date};
 for(const [name,value] of Object.entries(attributes))catalog.facts[`ebay.aspect.${name}`]={value,status:'confirmed',source:'synthetic fixture',observed_at:date};
 catalog.media=[{url:'https://example.com/sign.jpg',checked_at:date,width:1000,height:1000,format:'jpeg',sha256:'a'.repeat(64)}];
 return {product,updated_at:date,owner_id:'fixture-owner',organization_id:'fixture-org'};
}
function fixture():EbayFamilyInput {
 const parent=item('GROUP','Parent'),children=[item('RED','Child','Red'),item('BLUE','Child','Blue')];
 parent.product._catalog!.variants=children.map(child=>({sku:String(child.product.sku),attributes:child.product._catalog!.channels['ebay-us']!.attributes}));
 for(const member of [parent,...children])member.product._catalog!.channels['ebay-us']!.approval=approveVersion(member.product,'ebay-us','fixture-reviewer');
 return {parent,children,taxonomy:taxonomy(),categoryId:'123',categoryTreeId:'0',taxonomyVersion:'test-tree-version',taxonomyFetchedAt:date,variationAspects:['Color'],imageVariationAspect:'Color',sellerId:'fixture-seller',now};
}
describe('eBay family pure preparation',()=>{
 it('prepares group/common aspects and child inventories/offers with stable manifest and zero publication',()=>{
  const input=fixture(),before=hash(input),pack=buildEbayFamilyPackage(input);
  expect(pack.guard).toEqual({ready:true,blockers:[]});expect(pack.group.variantSKUs).toEqual(['BLUE','RED']);
  expect(pack.group.aspects).toEqual({Material:['Aluminum']});expect(pack.group.variesBy).toEqual({specifications:[{name:'Color',values:['Blue','Red']}],aspectsImageVariesBy:['Color']});
  expect(pack.members[0].inventory.product.aspects.Color).toEqual(['Blue']);expect(pack.members[0].offer.availableQuantity).toBe(0);
  expect(pack.publication).toBe('not_submitted');expect(pack.group.description).toContain('&lt;checked&gt;');expect(hash(input)).toBe(before);
  expect(buildEbayFamilyPackage({...input,children:[...input.children].reverse()}).request_hash).toBe(pack.request_hash);
 });
 it('blocks stale review, unknown facts, missing media, schema version and eligibility without inventing them',()=>{
  const input=fixture(),child=input.children[0].product;child._catalog!.facts.material.status='pending';child._catalog!.media=[];child._catalog!.eligibility_confirmed=false;child._catalog!.channels['ebay-us']!.schema!.version='old';
  const codes=buildEbayFamilyPackage(input).guard.blockers.map(value=>value.code);
  expect(codes).toEqual(expect.arrayContaining(['fact_unconfirmed','version_review_required','media_check_required','official_schema_required','eligibility_required']));
 });
 it('rejects scope mismatch, family omission, duplicate SKU and duplicate variation combination',()=>{
  const scope=fixture();scope.children[0].organization_id='foreign';expect(()=>buildEbayFamilyPackage(scope)).toThrow('organização');
  const omission=fixture();omission.parent.product._catalog!.variants.pop();expect(()=>buildEbayFamilyPackage(omission)).toThrow('omissões');
  const duplicate=fixture();duplicate.children[1].product.sku='RED';expect(()=>buildEbayFamilyPackage(duplicate)).toThrow('único');
  const combo=fixture();combo.children[1].product._catalog!.channels['ebay-us']!.attributes.Color=['Red'];expect(()=>buildEbayFamilyPackage(combo)).toThrow('duplicada');
 });
 it('rejects wrong parent, contract, disabled variation and inconsistent common aspects/policies',()=>{
  const wrong=fixture();wrong.children[0].product.parent_sku='OTHER';expect(()=>buildEbayFamilyPackage(wrong)).toThrow('referenciar');
  const expired=fixture();expired.taxonomyFetchedAt='2000-01-01';expect(()=>buildEbayFamilyPackage(expired)).toThrow('expirado');
  const disabled=fixture();disabled.taxonomy.aspects[0].aspectConstraint.aspectEnabledForVariations=false;expect(()=>buildEbayFamilyPackage(disabled)).toThrow('habilitado');
  const common=fixture();common.children[0].product._catalog!.channels['ebay-us']!.attributes.Material=['Steel'];expect(()=>buildEbayFamilyPackage(common)).toThrow('comuns');
  const policies=fixture();policies.children[0].product.ebay_return_policy='999';expect(()=>buildEbayFamilyPackage(policies)).toThrow('policies');
 });
 it('preserves explicit identity, reviewed copy and image variation mapping',()=>{
  const noIdentity=fixture();delete noIdentity.children[0].product.gtin;expect(()=>buildEbayFamilyPackage(noIdentity)).toThrow('GTIN');
  const copy=fixture();copy.children[0].product.title='Unreviewed overridden title';expect(()=>buildEbayFamilyPackage(copy)).toThrow('coincidir');
  const images=fixture();images.imageVariationAspect='Material';expect(()=>buildEbayFamilyPackage(images)).toThrow('imagens');
 });
 it('includes child timestamp and seller identity in request hash',()=>{
  const first=fixture(),hash1=buildEbayFamilyPackage(first).request_hash;first.children[0].updated_at=new Date(now+1).toISOString();
  expect(buildEbayFamilyPackage(first).request_hash).not.toBe(hash1);
  first.sellerId='other-seller';expect(buildEbayFamilyPackage(first).request_hash).not.toBe(hash1);
 });
 it('rechecks review and exact versions before a coordinator can reserve the family',()=>{
  const input=fixture(),expected=buildEbayFamilyPackage(input).request_hash;
  expect(assertEbayFamilyVersion(input,expected).publication).toBe('not_submitted');
  delete input.children[0].product._catalog!.channels['ebay-us']!.approval;
  expect(()=>assertEbayFamilyVersion(input,expected)).toThrow('pendentes');
  input.children[0].updated_at=new Date(now+1).toISOString();expect(()=>assertEbayFamilyVersion(input,expected)).toThrow('mudou');
 });
});

describe('advanced eBay aspects documented contracts',()=>{
 const range=():EbayTaxonomyAspects=>({aspects:[{localizedAspectName:'Device Charging Range',aspectConstraint:{aspectRequired:true,aspectMode:'FREE_TEXT',aspectDataType:'STRING',itemToAspectCardinality:'SINGLE',aspectAdvancedDataType:'NUMERIC_RANGE'}}]});
 it('accepts CCD min-max format and rejects inverted, excessive precision and arbitrary numeric ranges',()=>{
  expect(validateEbayAdvancedAspects(range(),{'Device Charging Range':['10-20.5']})).toEqual([]);
  for(const value of ['20-10','10-20.55','1000-2000','-1-20','10 W - 20 W','10','1e2-200'])expect(validateEbayAdvancedAspects(range(),{'Device Charging Range':[value]}).length).toBeGreaterThan(0);
  const unknown=range();unknown.aspects[0].localizedAspectName='Undocumented Range';expect(validateEbayAdvancedAspects(unknown,{'Undocumented Range':['10-20']}).length).toBeGreaterThan(0);
 });
 it('validates a single controller including missing/disallowed controls while keeping multiple controls blocked',()=>{
  const data=taxonomy();data.aspects[0].aspectValues![0].valueConstraints=[{applicableForLocalizedAspectName:'Material',applicableForLocalizedAspectValues:['Aluminum']}];
  expect(validateEbayAdvancedAspects(data,{Color:['Red'],Material:['Aluminum']})).toEqual([]);
  expect(validateEbayAdvancedAspects(data,{Color:['Red'],Material:['Steel']}).length).toBeGreaterThan(0);
  expect(validateEbayAdvancedAspects(data,{Color:['Red']}).length).toBeGreaterThan(0);
  data.aspects[0].aspectValues![0].valueConstraints!.push({applicableForLocalizedAspectName:'Other control',applicableForLocalizedAspectValues:['Yes']});
  expect(validateEbayAdvancedAspects(data,{Color:['Red'],Material:['Aluminum']}).map(issue=>issue.code)).toContain('ebay_multiple_controls_unsupported');
 });
 it('rejects duplicate aspect definitions and unknown advanced types',()=>{
  const data=range();data.aspects.push(structuredClone(data.aspects[0]));expect(()=>ebayAdvancedAspectSchema(data)).toThrow('duplicados');
  const unknown=range();unknown.aspects[0].aspectConstraint.aspectAdvancedDataType='OTHER';expect(validateEbayAdvancedAspects(unknown,{'Device Charging Range':['10-20']}).length).toBeGreaterThan(0);
 });
});
