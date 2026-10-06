import {describe,expect,it} from 'vitest';
import {createCatalog,hash,TECHNICAL_FIELDS,contentHash,type ProductInput} from '../lib/catalog/model';
import {ebayAdvancedAspectSchema} from '../lib/marketplaces/ebay-advanced-aspects';
import {evaluateReadiness} from '../lib/catalog/readiness';
import {applyAction} from '../lib/catalog/actions';
import {approvalValid} from '../lib/catalog/approval';
const date=new Date().toISOString(),taxonomy={aspects:[{localizedAspectName:'Color',aspectConstraint:{aspectRequired:true,aspectMode:'SELECTION_ONLY' as const,aspectDataType:'STRING',itemToAspectCardinality:'SINGLE' as const,aspectEnabledForVariations:true},aspectValues:[{localizedValue:'Red'},{localizedValue:'Blue'}]},{localizedAspectName:'Material',aspectConstraint:{aspectRequired:true,aspectMode:'FREE_TEXT' as const,aspectDataType:'STRING',itemToAspectCardinality:'SINGLE' as const}}]};
function product(parent:boolean):ProductInput{
 const result:ProductInput={sku:parent?'PARENT':'RED',title:'Sign',description:'Steel sign',brand:'FBR',origin:'US',material:'Steel',relationship:parent?'Parent':'Child',parent_sku:parent?undefined:'PARENT',variation:'Color',price:20,qty:0,currency:'USD',mpn:parent?undefined:'RED-1',ebay_condition:'NEW',ebay_location:'warehouse',ebay_payment_policy:'1',ebay_return_policy:'2',ebay_fulfillment_policy:'3',pkg_length:10,pkg_width:10,pkg_height:1,pkg_weight:1,images:['https://example.com/sign.jpg'],assets_reviewed:true,policy_reviewed:true,_catalog:createCatalog({})};
 const catalog=result._catalog!;catalog.kind='physical';catalog.eligibility_confirmed=true;for(const field of TECHNICAL_FIELDS)if(result[field]!==undefined)catalog.facts[field]={value:result[field],source:'synthetic contract test',status:'confirmed',observed_at:date};
 const schema=ebayAdvancedAspectSchema(taxonomy);catalog.channels['ebay-us']={category:'123',product_type:'SIGN',attributes:{Material:['Steel'],...(!parent?{Color:['Red']}:{})},schema:{channel:'ebay-us',category:'123',product_type:'SIGN',schema,checksum:hash(schema),version:'1',fetched_at:date,metadata:{category_tree_id:'0',taxonomy}},...(parent?{family:{variation_aspects:['Color'],image_variation_aspect:'Color'}}:{})};for(const [name,value] of Object.entries(catalog.channels['ebay-us']!.attributes))catalog.facts['ebay.aspect.'+name]={value,status:'confirmed',source:'synthetic contract test',observed_at:date};catalog.media=[{url:'https://example.com/sign.jpg',width:1000,height:1000,format:'jpeg',sha256:'a'.repeat(64),checked_at:date}];return result;
}
describe('eBay family core review path',()=>{
 it('can approve Parent common aspects and Child specific aspects without enabling standalone family export',async()=>{
  for(const parent of [true,false]){const p=product(parent);expect(evaluateReadiness(p,'ebay-us',false).issues).toEqual([]);const reviewed=await applyAction(p,{userId:'reviewer',organizationId:'org',mode:'local-only'},'review',{channel:'ebay-us',expected_hash:contentHash(p,'ebay-us')});expect(approvalValid(reviewed.product,'ebay-us')).toBe(true);}
 });
 it('confirms aspect values from saved category fields and rejects forged field names',async()=>{
  const p=product(false),auth={userId:'reviewer',organizationId:'org',mode:'local-only' as const};
  const checked=await applyAction(p,auth,'confirm-facts',{channel:'ebay-us',fields:['ebay.aspect.Color'],source:'synthetic documented color'});
  expect(checked.product._catalog!.facts['ebay.aspect.Color']).toMatchObject({status:'confirmed',value:['Red']});
  await expect(applyAction(p,auth,'confirm-facts',{channel:'ebay-us',fields:['ebay.aspect.Invented'],source:'test'})).rejects.toThrow();
  p._catalog!.channels['ebay-us']!.family={variation_aspects:['Invented'],image_variation_aspect:'Invented'};p.relationship='Parent';expect(evaluateReadiness(p,'ebay-us',false).issues.map(issue=>issue.code)).toContain('ebay_family_contract_required');
 });
});
