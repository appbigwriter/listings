import type { AuthContext } from '../auth';
import { buildAiGenerationPayload } from '../ai/contracts';
import { generateListing } from '../ai/generate';
import { recommendCategory } from '../ai/classify';
import { normalizeImportedProduct } from './import';
import { amazonAttributes, amazonDiscover, amazonFees, amazonPayload, amazonPreview, amazonReadback, amazonRestrictions } from '../marketplaces/amazon';
import { categorySuggestions, channelSchema } from '../marketplaces/adapters';
import { checkImage } from './media';
import { contentHash, createCatalog, isChannel, TECHNICAL_FIELDS, type Channel, type ProductInput } from './model';
import { evaluateReadiness } from './readiness';
import { CatalogError } from './repository';
import { approveVersion } from './approval';
import type { AiRuntime } from '../ai/usage';
import {buildEbayPackage,ebayAccountPreparation} from '../marketplaces/ebay-package';
import {validateChannelCopy} from './copy';
import {COPY_FIELDS} from './model';
import {submissionMatches} from './reconciliation';

export async function applyAction(input: ProductInput, auth: AuthContext, action: string, options: Record<string, unknown> = {}, aiRuntime:AiRuntime={}) {
  const product = structuredClone(input); product._catalog = createCatalog(product, product._catalog);
  if (options.channel !== undefined && !isChannel(options.channel)) throw new CatalogError('Canal inválido.');
  const channel: Channel = isChannel(options.channel) ? options.channel : 'amazon-us';
  const catalog = product._catalog;
  const listing = catalog.channels[channel] ||= { product_type: '', category: '', attributes: {} };
  let output: unknown;
  switch (action) {
    case 'account-preparation': {
      if(channel!=='ebay-us'||!listing.category)throw new CatalogError('Selecione a categoria eBay antes de consultar policies e condições.');
      output=await ebayAccountPreparation(listing.category);break;
    }
    case 'configure': {
      if(options.copy!==undefined)listing.copy=validateChannelCopy(options.copy,channel);
      if (options.kind !== undefined) {
        if (!['physical', 'custom', 'service', 'unknown'].includes(String(options.kind))) throw new CatalogError('Tipo de produto inválido.');
        catalog.kind = options.kind as typeof catalog.kind; catalog.eligibility_confirmed = options.kind !== 'unknown';
      }
      if (options.product_type !== undefined) listing.product_type = String(options.product_type);
      if (options.category !== undefined) listing.category = String(options.category);
      if (options.attributes !== undefined) {
        if (!options.attributes || typeof options.attributes !== 'object' || Array.isArray(options.attributes)) throw new CatalogError('Atributos precisam ser um objeto JSON.');
        const supplied = options.attributes as Record<string, unknown>;
        // Keep only explicit overrides; derived values must follow future product edits.
        const derived = channel === 'amazon-us' ? amazonAttributes({ ...product, _catalog: { ...catalog, channels: { ...catalog.channels, [channel]: { ...listing, attributes: {} } } } }) : {};
        listing.attributes = Object.fromEntries(Object.entries(supplied).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(derived[key])));
      }
      if (channel === 'amazon-us') { if(options.product_type!==undefined)product.product_type=listing.product_type;if(options.category!==undefined)product.category=listing.category; }
      break;
    }
    case 'confirm-facts': {
      if (!Array.isArray(options.fields) || !String(options.source || '').trim()) throw new CatalogError('Informe os campos e a fonte da confirmação.');
      for (const field of options.fields) {
        if (!TECHNICAL_FIELDS.includes(field as typeof TECHNICAL_FIELDS[number]) || product[String(field)] === undefined || String(product[String(field)]).trim() === '') throw new CatalogError(`Fato inválido: ${field}.`);
        catalog.facts[String(field)] = { value: product[String(field)], source: `${String(options.source)}; confirmado por ${auth.userId}`, status: 'confirmed', observed_at: new Date().toISOString() };
      }
      break;
    }
    case 'classify': {
      listing.suggestions = await categorySuggestions(channel, String(product.title));
      const recommendation = await recommendCategory(String(product.title), String(product.description || ''), listing.suggestions!, aiRuntime);
      if (recommendation) {
        listing.recommendation = recommendation;
        if (!listing.product_type && recommendation.confidence >= 0.85) listing.product_type = recommendation.id;
        if (channel === 'ebay-us' && !listing.category && recommendation.confidence >= 0.85) listing.category = recommendation.id;
      }
      output = { suggestions: listing.suggestions, recommendation }; break;
    }
    case 'schema': {
      if (!listing.product_type || channel !== 'amazon-us' && !listing.category) throw new CatalogError('Selecione tipo de produto antes de carregar requisitos.');
      listing.schema = await channelSchema(channel, listing.product_type, listing.category, product.relationship === 'Child' ? 'CHILD' : product.relationship === 'Parent' ? 'PARENT' : 'NONE');
      output = listing.schema; break;
    }
    case 'generate': {
      const result = await generateListing(buildAiGenerationPayload(product),aiRuntime,{channel,locale:'en_US'});
      listing.copy={...validateChannelCopy({locale:'en_US',...Object.fromEntries(COPY_FIELDS.map(field=>[field,String(result[field]||'')]))},channel),source:'ai',grounding:result.grounding};
      output = result; break;
    }
    case 'media': {
      const urls = Array.isArray(product.images) ? product.images.map(String) : String(product.images || '').split(/\n+/).filter(Boolean);
      if (!urls.length || urls.length > 9) throw new CatalogError('Informe de uma a nove imagens.');
      catalog.media = [];
      const errors: string[] = [];
      for (const url of urls) { try { catalog.media.push(await checkImage(url)); } catch (error) { errors.push(`${url}: ${error instanceof Error ? error.message : 'Imagem inválida.'}`); } }
      output = { checks: catalog.media, errors }; break;
    }
    case 'validate': break;
    case 'discover': {
      if (channel !== 'amazon-us') throw new CatalogError('Discovery disponível para Amazon.');
      output=await amazonDiscover(product); product.amazon_discovery={checked_at:new Date().toISOString(),result:output}; break;
    }
    case 'fees': {
      if (channel !== 'amazon-us') throw new CatalogError('Estimativa de tarifas disponível para Amazon.');
      output=await amazonFees(product); product.amazon_fees={checked_at:new Date().toISOString(),price:Number(product.price),fulfillment:product.fulfillment,currency:'USD',result:output}; break;
    }
    case 'apply-source-update': {
      const update = product.source_update as typeof catalog.source;
      if (!update?.snapshot) throw new CatalogError('Não existe atualização pendente da fonte.');
      if (options.keep_current === true) {
        if (!String(options.reason || '').trim()) throw new CatalogError('Registre o motivo para manter os dados atuais.');
        product.source_resolution = { reason: String(options.reason), actor: auth.userId, at: new Date().toISOString() };
      } else {
        if (!Array.isArray(options.fields) || !options.fields.length) throw new CatalogError('Selecione os campos da fonte que deseja aplicar.');
        const normalized = normalizeImportedProduct(update.snapshot, update.id);
        for (const key of options.fields) {
          if (typeof key !== 'string' || !['title','description','images','price','qty', ...TECHNICAL_FIELDS].includes(key)) throw new CatalogError('Campo de reconciliação inválido.');
          product[key] = normalized[key];
          if (catalog.facts[key]) catalog.facts[key] = { ...catalog.facts[key], value: normalized[key], status: 'pending' };
        }
      }
      catalog.source = update; delete product.source_update; break;
    }
    case 'review': {
      if (options.expected_hash !== contentHash(product, channel)) throw new CatalogError('A versão revisada mudou. Recarregue o produto.', 409);
      const report = evaluateReadiness(product, channel, false);
      if (!report.ready) throw new CatalogError(`Resolva os bloqueios antes de aprovar: ${report.issues.map(issue => issue.code).join(', ')}.`, 422);
      listing.approval = approveVersion(product, channel, auth.userId); break;
    }
    case 'restrictions': {
      if (channel !== 'amazon-us' || !product.asin) throw new CatalogError('Consulta de restrições requer um ASIN existente da Amazon.');
      output = await amazonRestrictions(String(product.asin)); product.amazon_restrictions = output; break;
    }
    case 'preview': {
      if (channel !== 'amazon-us') throw new CatalogError('Preview disponível para Amazon.');
      if (!listing.schema) throw new CatalogError('Carregue os requisitos oficiais primeiro.');
      output = await amazonPreview(product); product.amazon_preview = output; break;
    }
    case 'submit': {
      throw new CatalogError('Submissões precisam passar pelo executor e registro persistente.', 403);
    }
    case 'monitor': {
      if (channel !== 'amazon-us') throw new CatalogError('Monitoramento por API habilitado somente para Amazon.');
      output = await amazonReadback(String(product.sku));
      const result = output as { attributes?:Record<string,unknown>;summaries?: { status?: string[] }[]; issues?: { severity?: string }[] };
      const published = result.summaries?.some(summary => summary.status?.includes('BUYABLE')) === true;
      const blocked = result.issues?.some(issue => issue.severity === 'ERROR') === true;
      const matched=submissionMatches(amazonPayload(product),result);
      listing.submission = { status: blocked ? 'rejected' : !matched?'unknown':published ? 'published' : 'processing', request_hash: listing.submission?.request_hash || '', submitted_at: listing.submission?.submitted_at || new Date().toISOString(), response: result, issues: result.issues, publication_status: matched&&published&&!blocked ? 'buyable' : 'not_buyable',...(matched?{verified_content_hash:contentHash(product,channel),verified_at:new Date().toISOString()}: {}) }; break;
    }
    default: throw new CatalogError('Ação inválida.');
  }
  if (action !== 'review' && listing.approval?.hash !== contentHash(product, channel)) delete listing.approval;
  listing.report = evaluateReadiness(product, channel);
  product.human_reviewed = Object.values(catalog.channels).some(item => item?.report?.ready);
  return { product, output, report: listing.report };
}
export function buildChannelPackage(product: ProductInput, channel: Channel) {
  const report = evaluateReadiness(product, channel);
  if (!report.ready) throw new CatalogError(`Exportação bloqueada: ${report.issues.map(issue => issue.code).join(', ')}.`, 422);
  const listing = product._catalog!.channels[channel]!;
  return { format: 'fbr-channel-package-v1', channel, sku: product.sku, content_hash: contentHash(product, channel), generated_at: new Date().toISOString(), approval: listing.approval, schema: { version: listing.schema!.version, checksum: listing.schema!.checksum },
    payload: channel === 'amazon-us' ? amazonPayload(product) : channel==='ebay-us'?buildEbayPackage(product):listing.attributes,
    product: { product_id: product._catalog!.product_id, variants: product._catalog!.variants, facts: product._catalog!.facts },
    publication: 'Prepared; publication requires a separate authorized action.' };
}
