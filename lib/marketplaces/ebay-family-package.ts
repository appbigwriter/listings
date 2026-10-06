import {approvalValid} from '../catalog/approval';
import {validateListing} from '../catalog/contracts';
import {channelProduct,contentHash,hash,TECHNICAL_FIELDS,type ProductInput} from '../catalog/model';
import {CatalogError} from '../catalog/repository';
import {buildEbayPackage} from './ebay-package';
import {ebayAdvancedAspectSchema,validateEbayAdvancedAspects,type EbayTaxonomyAspects} from './ebay-advanced-aspects';

export type EbayFamilyItem={product:ProductInput;updated_at:string;owner_id:string;organization_id:string};
export type EbayFamilyInput={parent:EbayFamilyItem;children:EbayFamilyItem[];taxonomy:EbayTaxonomyAspects;categoryId:string;categoryTreeId:string;taxonomyVersion:string;taxonomyFetchedAt:string;variationAspects:string[];imageVariationAspect:string;sellerId:string;now?:number};
const escape=(value:string)=>value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!)).replace(/\r?\n/g,'<br>');
function fail(message:string):never{throw new CatalogError(message,422);}
const same=(a:unknown,b:unknown)=>hash(a)===hash(b);
function httpsImage(value:unknown) {
  if(typeof value!=='string')return false;
  try{const url=new URL(value);return url.protocol==='https:'&&Boolean(url.hostname)&&!url.username&&!url.password;}catch{return false;}
}

/** Pure preparation. Never calls eBay, reserves a claim, or marks a listing published. */
export function buildEbayFamilyPackage(input:EbayFamilyInput) {
  const now=input.now??Date.now(),parent=channelProduct(input.parent.product,'ebay-us');
  const key=typeof parent.sku==='string'?parent.sku:'';
  if(parent.relationship!=='Parent'||!key.trim()||key!==key.trim()||key.length>50||/[\x00-\x1f]/.test(key))fail('Família requer Parent e group key/SKU válido de até 50 caracteres.');
  if(!input.sellerId||!input.parent.owner_id||!input.parent.organization_id)fail('Identidade de seller, owner e organização obrigatória.');
  if(!/^\d+$/.test(input.categoryId)||!/^\d+$/.test(input.categoryTreeId)||!input.taxonomyVersion)fail('Categoria, árvore e versão eBay obrigatórias.');
  const fetched=Date.parse(input.taxonomyFetchedAt);
  if(!Number.isFinite(fetched)||fetched>now+300000||now-fetched>7*86400000)fail('Contrato de categoria expirado ou inválido.');
  if(!Array.isArray(input.children)||input.children.length<2||input.children.length>250)fail('Família requer 2 a 250 variantes; limite conservador do preparador.');
  if(!input.variationAspects.length||input.variationAspects.length>5||new Set(input.variationAspects).size!==input.variationAspects.length)fail('Selecione de 1 a 5 aspectos de variação distintos.');
  if(!input.variationAspects.includes(input.imageVariationAspect))fail('O aspecto das imagens deve constar dos aspectos de variação.');
  for(const name of input.variationAspects) {
    const definition=input.taxonomy.aspects.find(aspect=>aspect.localizedAspectName===name);
    if(!definition?.aspectConstraint.aspectEnabledForVariations||definition.aspectConstraint.itemToAspectCardinality!=='SINGLE'||name.length>40)fail('Aspecto não habilitado para variações SINGLE no contrato eBay.');
  }
  const listing=parent._catalog?.channels['ebay-us'];
  if(!listing||listing.category!==input.categoryId)fail('Categoria do parent diverge do contrato.');
  if(!parent.title||[...parent.title].length>80||typeof parent.description!=='string'||!parent.description.trim())fail('Título/descrição de grupo obrigatórios e título até 80 caracteres.');
  const parentAspects=listing.attributes;
  if(input.variationAspects.some(name=>Object.hasOwn(parentAspects,name)))fail('Aspectos que variam não podem constar dos aspectos comuns do grupo.');
  const blockers:{sku:string;code:string;field:string}[]=[],combos=new Set<string>(),skus=new Set<string>();
  const guard=(item:EbayFamilyItem,isParent=false)=>{
    const product=item.product,catalog=product._catalog,channel=catalog?.channels['ebay-us'];
    const add=(code:string,field:string)=>blockers.push({sku:String(product.sku),code,field});
    if(!Number.isFinite(Date.parse(item.updated_at)))fail('Versão updated_at inválida.');
    if(item.owner_id!==input.parent.owner_id||item.organization_id!==input.parent.organization_id)fail('Todos os membros devem ter o mesmo owner e organização.');
    if(!approvalValid(product,'ebay-us'))add('version_review_required','approval');
    if(!catalog?.eligibility_confirmed||!['physical','custom'].includes(catalog.kind))add('eligibility_required','kind');
    if(product.source_update)add('source_reconciliation_required','source');
    if(product.policy_reviewed!==true||product.assets_reviewed!==true)add('policy_media_review_required','review');
    for(const field of TECHNICAL_FIELDS.filter(field=>!['compliance','color','included','manufacturer'].includes(field)&&!(isParent&&(field.startsWith('pkg_')||['gtin','mpn'].includes(field)))&&( !['gtin','mpn'].includes(field)||Boolean(product[field])))) {
      const fact=catalog?.facts[field];
      if(!fact||fact.status!=='confirmed'||!same(fact.value,product[field])||!fact.source.trim()||!Number.isFinite(Date.parse(fact.observed_at))||Date.parse(fact.observed_at)>now+300000)add('fact_unconfirmed',field);
    }
    if(!channel||channel.category!==input.categoryId)fail('Categoria de membro diverge do grupo.');
    const schema=channel.schema;
    if(!schema||schema.channel!=='ebay-us'||schema.category!==input.categoryId||schema.product_type!==channel.product_type||schema.version!==input.taxonomyVersion||schema.checksum!==hash(schema.schema)||schema.checksum!==hash(ebayAdvancedAspectSchema(input.taxonomy))||!Number.isFinite(Date.parse(schema.fetched_at))||now-Date.parse(schema.fetched_at)>7*86400000||Date.parse(schema.fetched_at)>now+300000)add('official_schema_required','schema');
    const attributes=channel.attributes;
    for(const [name,value] of Object.entries(attributes)) {
      const fact=catalog?.facts[`ebay.aspect.${name}`];
      if(!fact||fact.status!=='confirmed'||!same(fact.value,value)||!fact.source.trim()||!Number.isFinite(Date.parse(fact.observed_at))||Date.parse(fact.observed_at)>now+300000)add('aspect_fact_unconfirmed',name);
    }
    const images=Array.isArray(product.images)?product.images:[];
    if(!images.length||images.length>24||images.some(url=>!httpsImage(url)))fail('Imagens HTTPS obrigatórias em cada membro/grupo.');
    for(const url of images) {
      const check=catalog?.media.find(value=>value.url===url),date=Date.parse(check?.checked_at||'');
      if(!check||!Number.isFinite(date)||now-date>86400000||date>now+300000||!check.width||!check.height||!/^[a-f0-9]{64}$/.test(check.sha256))add('media_check_required','images');
    }
  };
  guard(input.parent,true);
  const members=input.children.map(item=>{
    const original=channelProduct(item.product,'ebay-us'),sku=String(original.sku||'');
    if(original.relationship!=='Child'||original.parent_sku!==key||!sku.trim()||sku!==sku.trim()||/[\x00-\x1f]/.test(sku)||sku.length>50||sku===key||skus.has(sku))fail('Child deve referenciar o parent e possuir SKU único de até 50 caracteres.');
    skus.add(sku);guard(item);
    if(original.title!==parent.title||original.description!==parent.description)fail('Título e descrição revisados de cada child devem coincidir com o grupo.');
    if(original.brand!==parent.brand)fail('Brand deve coincidir em todos os membros da família.');
    const attributes=original._catalog!.channels['ebay-us']!.attributes;
    const issues=validateEbayAdvancedAspects(input.taxonomy,attributes);
    if(issues.length)fail(`Aspectos de ${sku} inválidos: ${issues.map(issue=>issue.code).join(', ')}.`);
    for(const [name,value] of Object.entries(parentAspects))if(!same(attributes[name],value))fail('Aspectos comuns devem coincidir em todos os children.');
    for(const [name] of Object.entries(attributes))if(!input.variationAspects.includes(name)&&!Object.hasOwn(parentAspects,name))fail('Aspecto não variável deve constar dos aspectos comuns do grupo.');
    const combo=input.variationAspects.map(name=>{
      const values=attributes[name];if(!Array.isArray(values)||values.length!==1||typeof values[0]!=='string'||values[0].length>50)fail('Cada child exige exatamente um valor por aspecto variável, até 50 caracteres.');
      return values[0];
    });
    const comboHash=hash(combo);if(combos.has(comboHash))fail('Combinação de variação duplicada.');combos.add(comboHash);
    const pack=buildEbayPackage({...original,relationship:'Standalone',title:parent.title,description:parent.description});
    for(const code of validateListing({...original,product_type:original._catalog!.channels['ebay-us']!.product_type,category:input.categoryId,human_reviewed:true}).errors.filter(code=>!code.startsWith('template_')&&!['identity_required','asin_invalid'].includes(code)))blockers.push({sku,code,field:code});
    return {sku,inventory:pack.inventory,offer:pack.offer,version:{updated_at:item.updated_at,content_hash:contentHash(item.product,'ebay-us')}};
  }).sort((a,b)=>a.sku.localeCompare(b.sku));
  const first=members[0].offer;
  for(const member of members)if(!same(member.offer.listingPolicies,first.listingPolicies)||member.offer.merchantLocationKey!==first.merchantLocationKey)fail('Todas as variantes exigem as mesmas policies e localização da conta.');
  const specifications=input.variationAspects.map(name=>{
    const values=[...new Set(members.map(member=>(member.inventory.product.aspects[name] as string[])[0]))].sort();
    if(values.length<2)fail('Cada aspecto declarado variável precisa de pelo menos dois valores.');
    return {name,values};
  });
  const declared=parent._catalog?.variants.map(value=>value.sku).sort();
  if(!declared||!same(declared,[...skus].sort()))fail('Manifesto de variantes do parent deve conter todos os children, sem omissões.');
  const group={title:parent.title,description:escape(parent.description as string),imageUrls:parent.images as string[],aspects:parentAspects,variantSKUs:members.map(member=>member.sku),variesBy:{specifications,aspectsImageVariesBy:[input.imageVariationAspect]}};
  const target={seller_id:input.sellerId,marketplace_id:'EBAY_US',owner_id:input.parent.owner_id,organization_id:input.parent.organization_id,category_id:input.categoryId,category_tree_id:input.categoryTreeId,taxonomy_version:input.taxonomyVersion,taxonomy_hash:hash(input.taxonomy)};
  const manifest={parent:{sku:key,updated_at:input.parent.updated_at,content_hash:contentHash(input.parent.product,'ebay-us')},members:members.map(member=>({sku:member.sku,...member.version})),target};
  return {format:'ebay-family-preparation-v1',groupKey:key,group,members,target,manifest,request_hash:hash({manifest,group,members}),guard:{ready:!blockers.length,blockers},publication:'not_submitted',required_live_checks:['category_variations_supported','account_opt_in','business_policies','inventory_location','existing_group_complete_membership','atomic_family_claim','group_publish_readback']};
}

/** Recompute from freshly scoped records, never from a client-submitted prepared package. */
export function assertEbayFamilyVersion(input:EbayFamilyInput,expectedRequestHash:string) {
  const prepared=buildEbayFamilyPackage(input);
  if(!/^[a-f0-9]{64}$/.test(expectedRequestHash)||prepared.request_hash!==expectedRequestHash)throw new CatalogError('A versão ou conta da família eBay mudou. Prepare e revise novamente.',409);
  if(!prepared.guard.ready)throw new CatalogError('Família eBay possui fatos, mídia, contrato ou revisão pendentes.',422);
  return prepared;
}
