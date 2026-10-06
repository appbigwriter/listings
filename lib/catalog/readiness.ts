import { validateListing } from './contracts';
import { channelFrom, channelProduct, contentHash, hash, TECHNICAL_FIELDS, type Channel, type Issue, type ProductInput } from './model';
import { validateSchema } from './schema';
import { amazonAttributes } from '../marketplaces/amazon';
import { approvalValid } from './approval';
import {buildEbayPackage} from '../marketplaces/ebay-package';
import {buildWalmartPackage} from '../marketplaces/walmart-package';
import {validateEbayAdvancedAspects} from '../marketplaces/ebay-advanced-aspects';

export function evaluateReadiness(input: ProductInput, channel: Channel = channelFrom(input.channel), requireApproval = true) {
  input=channelProduct(input,channel);
  const issues: Issue[] = [];
  const add = (code: string, field: string, message: string, action: string, severity: Issue['severity'] = 'error') => issues.push({ code, field, message, action, severity });
  const catalog = input._catalog; const listing = catalog?.channels[channel];
  if(listing?.schema_refresh_pending)add('schema_refresh_pending','schema','Uma notificação solicitou atualizar os requisitos oficiais.','Atualize o schema e revise as alterações antes de enviar.');
  if(channel==='ebay-us'&&listing)for(const [name,value] of Object.entries(listing.attributes)){const fact=catalog?.facts['ebay.aspect.'+name];if(!fact||fact.status!=='confirmed'||hash(fact.value)!==hash(value)||typeof fact.source!=='string'||!fact.source.trim()||!Number.isFinite(Date.parse(fact.observed_at))||Date.parse(fact.observed_at)>Date.now()+300000)add('ebay_aspect_fact_unconfirmed',name,'Aspecto eBay ainda não comprovado nesta versão.','Confirme os aspectos salvos com a documentação do produto.');}
  if(channel==='ebay-us'&&input.relationship!=='Parent')try{buildEbayPackage(input,{familyMember:input.relationship==='Child'});}catch(error){add('ebay_preparation_required','ebay',error instanceof Error?error.message:'Pacote eBay inválido.','Complete a preparação específica do eBay.');}
  if(channel==='ebay-us'&&input.relationship==='Parent'){
    const family=listing?.family,taxonomy=listing?.schema?.metadata?.taxonomy;
    if(!family||!taxonomy||!family.variation_aspects.every(name=>taxonomy.aspects.some(aspect=>aspect.localizedAspectName===name&&aspect.aspectConstraint.aspectEnabledForVariations&&aspect.aspectConstraint.itemToAspectCardinality==='SINGLE'))||family.variation_aspects.some(name=>Object.hasOwn(listing?.attributes||{},name)))add('ebay_family_contract_required','family','Defina aspectos variáveis habilitados pela categoria eBay.','Carregue a categoria e configure os eixos da família.');
    if([...(String(input.title||''))].length>80||!String(input.description||'').trim())add('ebay_group_copy_required','title','Título e descrição de grupo inválidos.','Revise o conteúdo comum da família.');
  }
  if(channel==='walmart-us')try{buildWalmartPackage(input);}catch(error){add('walmart_preparation_required','walmart',error instanceof Error?error.message:'Pacote Walmart inválido.','Complete a preparação conforme a Get Spec da conta.');}
  if (channel === 'amazon-us' && catalog && listing) {
    const derived = amazonAttributes({ ...input, _catalog: { ...catalog, channels: { ...catalog.channels, [channel]: { ...listing, attributes: {} } } } });
    for (const [key, value] of Object.entries(listing.attributes)) {
      if (key in derived && hash(value) !== hash(derived[key])) add('attribute_conflict', key, 'O atributo do canal diverge do dado registrado no produto.', 'Corrija o dado do produto e remova o atributo divergente; confirme novamente os fatos técnicos.');
    }
  }
  if (channel === 'amazon-us' && !['FBM', 'FBA'].includes(String(input.fulfillment))) add('fulfillment_required', 'fulfillment', 'Modalidade de envio não definida.', 'Selecione FBM ou FBA.');
  if (input.source_update) add('source_reconciliation_required', 'source', 'A fonte mudou e ainda não foi reconciliada.', 'Compare e aplique a atualização ou registre uma decisão de manter os dados atuais.');
  for (const code of validateListing({ ...input, product_type: listing?.product_type, category: listing?.category, human_reviewed: true }).errors.filter(code => !code.startsWith('template_')&&!(channel==='ebay-us'&&['identity_required','asin_invalid'].includes(code)))) add(code, code.replace(/_required$/, ''), code.replaceAll('_', ' '), 'Complete os dados do produto.');
  if (!catalog?.eligibility_confirmed || !['physical', 'custom'].includes(catalog.kind)) add('eligibility_required', 'kind', 'Elegibilidade do produto ainda não confirmada.', 'Defina se é produto físico, personalizado ou serviço.');
  if (catalog?.kind === 'service') add('service_excluded', 'kind', 'Serviço fora do fluxo padrão de produtos físicos.', 'Separe o serviço e configure uma oferta física quando aplicável.');
  if (catalog?.kind === 'custom' && input.fulfillment !== 'FBM' && channel === 'amazon-us') add('custom_fbm_required', 'fulfillment', 'Personalizados Amazon Custom exigem envio pelo vendedor.', 'Selecione FBM e confirme sua habilitação no Amazon Custom.');
  for (const field of TECHNICAL_FIELDS.filter(field => (!['gtin', 'mpn', 'compliance', 'color', 'included', 'manufacturer'].includes(field)||['gtin','mpn'].includes(field)&&Boolean(input[field])) && !(input.relationship === 'Parent' && field.startsWith('pkg_')))) {
    const fact = catalog?.facts[field];
    if (!fact || fact.status !== 'confirmed' || hash(fact.value) !== hash(input[field])) add('fact_unconfirmed', field, `Dado técnico não confirmado: ${field}.`, 'Confirme o valor com uma ficha técnica ou medição real.');
  }
  if (!listing?.product_type || !listing.category) add('classification_required', 'category', 'Classificação do canal incompleta.', 'Selecione uma categoria e um tipo de produto oficiais.');
  const schema = listing?.schema;
  if (!schema || schema.product_type !== listing?.product_type || schema.category !== listing?.category || schema.channel !== channel || schema.checksum !== hash(schema.schema)) add('official_schema_required', 'category', 'Requisitos oficiais ainda não carregados para esta classificação.', 'Busque os requisitos do canal.');
  else if (Date.now() - Date.parse(schema.fetched_at) > 7 * 86400000 || Date.parse(schema.fetched_at)>Date.now()+300000 || !Number.isFinite(Date.parse(schema.fetched_at))) add('schema_expired', 'category', 'Os requisitos precisam ser atualizados.', 'Recarregue os requisitos oficiais.');
  else {
    const attributes = channel === 'amazon-us' ? amazonAttributes(input) : channel==='walmart-us'?undefined:listing.attributes;
    if(attributes){
      let validationSchema=schema.schema;
      if(channel==='ebay-us'&&input.relationship==='Parent'&&listing.family&&schema.metadata){
        const axes=listing.family.variation_aspects,required=Array.isArray(schema.schema.required)?schema.schema.required.filter(field=>!axes.includes(String(field))):[];
        // The group carries common aspects; full axis-dependent constraints apply to each child.
        const clauses=Array.isArray(schema.schema.allOf)?schema.schema.allOf.filter((clause:any)=>![...Object.keys(clause.if?.properties||{}),...Object.keys(clause.then?.properties||{})].some(name=>axes.includes(name))):undefined;
        validationSchema={...schema.schema,required,...(clauses?{allOf:clauses}:{})};
      }
      issues.push(...validateSchema(validationSchema, attributes));
      if(channel==='ebay-us'&&input.relationship!=='Parent'&&schema.metadata)issues.push(...validateEbayAdvancedAspects(schema.metadata.taxonomy,attributes));
    }
  }
  const images = Array.isArray(input.images) ? input.images.map(String) : String(input.images || '').split(/\n+/).filter(Boolean);
  for (const url of images) {
    const check = catalog?.media.find(media => media.url === url);
    if (!check || !Number.isFinite(Date.parse(check.checked_at)) || Date.now() - Date.parse(check.checked_at) > 86400000) add('media_check_required', 'images', 'Imagem ainda não verificada ou verificação expirada.', 'Execute a verificação de mídia.');
    else if (channel === 'amazon-us' && (check.width < 500 || check.height < 500 || check.width > 10000 || check.height > 10000)) add('image_dimensions_invalid', 'images', 'Dimensões da imagem fora da faixa técnica de preparação Amazon.', 'Forneça uma imagem de 500 a 10.000 pixels por lado e confira a categoria.');
  }
  if (input.assets_reviewed !== true) add('media_review_required', 'images', 'Fidelidade e direitos das imagens pendentes.', 'Revise imagens, mockups e direitos de uso.');
  if (input.policy_reviewed !== true) add('policy_review_required', 'compliance', 'Políticas e documentação ainda não revisadas.', 'Confirme os requisitos de segurança, marca e personalização.');
  if (/https?:\/\/|free shipping|contact us|\b(best seller|guaranteed|100% safe)\b/i.test(`${input.title || ''} ${input.bullets || ''} ${input.description || ''}`)) add('editorial_review_required', 'description', 'Conteúdo contém links, promoção ou claims que exigem revisão.', 'Remova conteúdo promocional ou apresente evidência para o claim.');
  if (channel === 'tiktok-us') add('channel_not_connected', 'channel', 'TikTok Shop ainda não possui conector configurado.', 'Configure um adaptador aprovado antes de liberar este canal.');
  if (requireApproval && !approvalValid(input, channel)) add('version_review_required', 'approval', 'Esta versão ainda não possui aprovação válida.', 'Revise e aprove a versão atual depois de resolver os bloqueios.');
  return { ready: !issues.some(issue => issue.severity === 'error'), issues, checked_at: new Date().toISOString() };
}
