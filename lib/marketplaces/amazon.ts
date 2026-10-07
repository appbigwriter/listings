import type { ProductInput, SchemaSnapshot } from '../catalog/model';
import { hash,channelProduct } from '../catalog/model';
import { publicFetch } from '../net/public-fetch';
import { readResponseWithLimit } from '../extract-security';
import {amazonFeeTarget} from './amazon-fee-estimates';
import {isNumericInput} from '../catalog/numeric-input';
import {traceEvent,withTrace} from '../operations/trace';
import {assertAmazonRecoveryRequest} from '../operations/recovery';

export class AmazonError extends Error { constructor(public status: number, public retryAfter: number, public stage = 'SP-API', public code?: string, public requestId?: string) { super(`Amazon ${stage} respondeu HTTP ${status}${code ? ` (${code})` : ''}.`);this.name='AmazonError'; } }
const safeIdentifier = (value: unknown) => typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,100}$/.test(value) ? value : undefined;
export function retryAfterSeconds(value: string | null) { if (!value) return 30; const numeric=Number(value); return Number.isFinite(numeric) ? Math.max(0, numeric) : Math.max(0,(Date.parse(value)-Date.now())/1000) || 30; }
export const amazonTelemetry: Record<string,{status:number;duration_ms:number;rate_limit:string|null;request_id?:string;checked_at:string}> = {};
async function readAmazonJson(response:Response,limit:number,stage='SP-API') {
  const text=await readResponseWithLimit(response,limit);
  try { return JSON.parse(text); } catch { if (!response.ok) throw new AmazonError(response.status,retryAfterSeconds(response.headers.get('retry-after')),stage); throw new Error('Amazon retornou uma resposta JSON inválida.'); }
}
export function amazonConfig() {
  const env = process.env;
  const endpoint = env.AMAZON_SP_API_ENDPOINT || 'https://sellingpartnerapi-na.amazon.com';
  if (!['https://sellingpartnerapi-na.amazon.com', 'https://sandbox.sellingpartnerapi-na.amazon.com', 'https://sellingpartnerapi-eu.amazon.com', 'https://sellingpartnerapi-fe.amazon.com'].includes(endpoint)) throw new Error('Endpoint Amazon inválido.');
  const sellerId = env.AMAZON_SP_API_SELLER_ID || '';
  const marketplaceId = env.AMAZON_MARKETPLACE_ID || 'ATVPDKIKX0DER';
  if (marketplaceId !== 'ATVPDKIKX0DER') throw new Error('Este conector está configurado para Amazon US.');
  return { endpoint, sellerId, marketplaceId, configured: Boolean(env.AMAZON_SP_API_CLIENT_ID && env.AMAZON_SP_API_CLIENT_SECRET && env.AMAZON_SP_API_REFRESH_TOKEN && sellerId) };
}
let cachedToken: { value: string; expires: number; configHash: string } | undefined;
let tokenFlight: { configHash:string; promise:Promise<string> } | undefined;
async function accessToken() {
  const configHash = hash([process.env.AMAZON_SP_API_CLIENT_ID, process.env.AMAZON_SP_API_REFRESH_TOKEN, process.env.AMAZON_SP_API_CLIENT_SECRET]);
  if (cachedToken?.configHash === configHash && cachedToken.expires > Date.now()) return cachedToken.value;
  if (tokenFlight?.configHash === configHash) return tokenFlight.promise;
  if (!amazonConfig().configured) throw new Error('Credenciais Amazon não configuradas.');
  const promise = refreshToken(configHash); tokenFlight={configHash,promise};
  try { return await promise; } finally { if (tokenFlight?.promise===promise) tokenFlight=undefined; }
}
async function refreshToken(configHash:string) {
  const response = await fetch('https://api.amazon.com/auth/o2/token', { method: 'POST', signal: AbortSignal.timeout(15000), headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', client_id: process.env.AMAZON_SP_API_CLIENT_ID!, client_secret: process.env.AMAZON_SP_API_CLIENT_SECRET!, refresh_token: process.env.AMAZON_SP_API_REFRESH_TOKEN! }) });
  const token = await readAmazonJson(response,32_000,'LWA (autenticação)');
  if (!response.ok) throw new AmazonError(response.status, 0, 'LWA (autenticação)',safeIdentifier(token.error));
  if (typeof token.access_token !== 'string' || !Number.isFinite(Number(token.expires_in))) throw new Error('Amazon não retornou um token válido.');
  cachedToken = { value: token.access_token, expires: Date.now() + Math.max(0, Number(token.expires_in) - 60) * 1000, configHash };
  return cachedToken.value;
}
export async function amazonRequest(path: string, query: Record<string, string> = {}, method = 'GET', body?: unknown) {
  return withTrace('amazon.request',{provider:'amazon'},()=>amazonRequestStep(path,query,method,body));
}
async function amazonRequestStep(path:string,query:Record<string,string>,method:string,body?:unknown){
  assertAmazonRecoveryRequest(path,query,method);
  const config = amazonConfig(); const url = new URL(path, config.endpoint);
  if (url.origin !== config.endpoint || !path.startsWith('/')) throw new Error('Caminho Amazon inválido.');
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  const start=Date.now();
  const response = await fetch(url, { method, redirect: 'error', signal: AbortSignal.timeout(25000), headers: { 'x-amz-access-token': await accessToken(), 'x-amz-date': new Date().toISOString().replace(/[:-]|\.\d{3}/g, ''), 'user-agent': 'FBRPreListing/0.2 (Language=TypeScript)', 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const requestId=safeIdentifier(response.headers.get('x-amzn-requestid'));
  traceEvent('provider.response',{http_status:response.status,provider_request_id:requestId,duration_ms:Date.now()-start});
  const operation=path.split('/').slice(0,3).join('/') + ':' + method;
  amazonTelemetry[operation]={status:response.status,duration_ms:Date.now()-start,rate_limit:response.headers.get('x-amzn-ratelimit-limit'),request_id:requestId,checked_at:new Date().toISOString()};
  const result = await readAmazonJson(response,5_000_000);
  if (!response.ok) { if (response.status === 401) cachedToken = undefined; throw new AmazonError(response.status, retryAfterSeconds(response.headers.get('retry-after')), 'SP-API',safeIdentifier(result.errors?.[0]?.code),requestId); }
  return result;
}
export async function amazonCategories(title: string) {
  const result = await amazonRequest('/definitions/2020-09-01/productTypes', { marketplaceIds: amazonConfig().marketplaceId, itemName: title, locale: 'en_US', searchLocale: 'en_US' });
  return (result.productTypes || []).map((item: { name: string; displayName: string }) => ({ id: item.name, name: item.displayName || item.name }));
}
export async function amazonSchema(productType: string, category: string, parentage = 'NONE'): Promise<SchemaSnapshot> {
  const config = amazonConfig();
  const result = await amazonRequest(`/definitions/2020-09-01/productTypes/${encodeURIComponent(productType)}`, { marketplaceIds: config.marketplaceId, sellerId: config.sellerId, requirements: 'LISTING', requirementsEnforced: 'ENFORCED', locale: 'en_US', parentageLevel: parentage });
  if (!result.schema?.link?.resource) throw new Error('Amazon não retornou o schema.');
  const { body } = await publicFetch(result.schema.link.resource);
  const schema = JSON.parse(body);
  if (result.schema.checksum) {
    const { createHash } = await import('node:crypto');
    if (createHash('md5').update(body).digest('base64') !== result.schema.checksum) throw new Error('Checksum do schema Amazon divergente.');
  }
  return { channel: 'amazon-us', category, product_type: productType, version: result.productTypeVersion?.version || 'LATEST', fetched_at: new Date().toISOString(), checksum: hash(schema), schema };
}
export function amazonAttributes(input: ProductInput): Record<string, unknown> {
  input=channelProduct(input,'amazon-us');
  const marketplace_id = amazonConfig().marketplaceId;
  const value = (v: unknown, language = false) => [{ value: v, marketplace_id, ...(language ? { language_tag: 'en_US' } : {}) }];
  const attributes: Record<string, unknown> = {};
  for (const [field, name, language] of [['title', 'item_name', true], ['brand', 'brand', false], ['manufacturer', 'manufacturer', false], ['origin', 'country_of_origin', false], ['description', 'product_description', true], ['material', 'material', true], ['color', 'color', true], ['keywords', 'generic_keyword', true]] as const) if (input[field]) attributes[name] = value(input[field], language);
  if (input.bullets) attributes.bullet_point = String(input.bullets).split(/\n+/).filter(Boolean).map(v => ({ value: v, marketplace_id, language_tag: 'en_US' }));
  if (input.gtin) attributes.externally_assigned_product_identifier = [{ type: String(input.id_type || 'UPC').toLowerCase(), value: input.gtin, marketplace_id }];
  if (input.gtin_exempt === true) attributes.supplier_declared_has_product_identifier_exemption = value(true);
  if (input._catalog?.channels['amazon-us']?.category) attributes.item_type_keyword = value(input._catalog.channels['amazon-us']!.category);
  if (input.asin) attributes.merchant_suggested_asin = value(input.asin);
  if (['Parent', 'Child'].includes(String(input.relationship))) {
    attributes.parentage_level = value(input.relationship === 'Parent' ? 'parent' : 'child');
    attributes.child_parent_sku_relationship = [{ marketplace_id, child_relationship_type: 'variation', ...(input.relationship === 'Child' ? { parent_sku: input.parent_sku } : {}) }];
    if (input.variation) attributes.variation_theme = [{ marketplace_id, name: input.variation }];
  }
  if ([input.pkg_length, input.pkg_width, input.pkg_height].every(v => isNumericInput(v)&&Number(v) > 0)) attributes.item_package_dimensions = [{ marketplace_id, length: { value: Number(input.pkg_length), unit: 'inches' }, width: { value: Number(input.pkg_width), unit: 'inches' }, height: { value: Number(input.pkg_height), unit: 'inches' } }];
  if (isNumericInput(input.pkg_weight)&&Number(input.pkg_weight) > 0) attributes.item_package_weight = [{ value: Number(input.pkg_weight), unit: 'pounds', marketplace_id }];
  const images = Array.isArray(input.images) ? input.images.map(String) : String(input.images || '').split(/\n+/).filter(Boolean);
  if (images[0]) attributes.main_product_image_locator = [{ media_location: images[0], marketplace_id }];
  images.slice(1, 9).forEach((url, index) => { attributes[`other_product_image_locator_${index + 1}`] = [{ media_location: url, marketplace_id }]; });
  if (input.relationship !== 'Parent') {
    if (isNumericInput(input.price)&&Number(input.price) > 0) attributes.purchasable_offer = [{ marketplace_id, currency: 'USD', our_price: [{ schedule: [{ value_with_tax: Number(input.price) }] }] }];
    if (input.fulfillment === 'FBM'&&isNumericInput(input.qty)&&Number.isSafeInteger(Number(input.qty))&&Number(input.qty)>=0) attributes.fulfillment_availability = [{ fulfillment_channel_code: 'DEFAULT', quantity: Number(input.qty), ...(isNumericInput(input.handling)&&Number.isSafeInteger(Number(input.handling))&&Number(input.handling)>=0 ? { lead_time_to_ship_max_days: Number(input.handling) } : {}) }];
  }
  return { ...attributes, ...input._catalog?.channels['amazon-us']?.attributes };
}
export function amazonPayload(input: ProductInput) { return { productType: input._catalog?.channels['amazon-us']?.product_type || input.product_type, requirements: 'LISTING', attributes: amazonAttributes(input) }; }
export async function amazonRestrictions(asin: string) { return amazonRequest('/listings/2021-08-01/restrictions', { asin, sellerId: amazonConfig().sellerId, marketplaceIds: amazonConfig().marketplaceId, conditionType: 'new_new', reasonLocale: 'en_US' }); }
export async function amazonPreview(input: ProductInput) { const config = amazonConfig(); return amazonRequest(`/listings/2021-08-01/items/${encodeURIComponent(config.sellerId)}/${encodeURIComponent(String(input.sku))}`, { marketplaceIds: config.marketplaceId, mode: 'VALIDATION_PREVIEW', issueLocale: 'en_US' }, 'PUT', amazonPayload(input)); }
export async function amazonSubmit(input: ProductInput) { const config = amazonConfig(); return amazonRequest(`/listings/2021-08-01/items/${encodeURIComponent(config.sellerId)}/${encodeURIComponent(String(input.sku))}`, { marketplaceIds: config.marketplaceId, issueLocale: 'en_US' }, 'PUT', amazonPayload(input)); }
export async function amazonReadback(sku: string) { const config = amazonConfig(); return amazonRequest(`/listings/2021-08-01/items/${encodeURIComponent(config.sellerId)}/${encodeURIComponent(sku)}`, { marketplaceIds: config.marketplaceId, includedData: 'summaries,issues,offers,fulfillmentAvailability,attributes', issueLocale: 'en_US' }); }
export async function amazonDiscover(input: ProductInput) {
  const config=amazonConfig();
  const includedData='summaries,identifiers,productTypes,classifications,relationships';
  if (input.asin) {
    if (!/^[A-Z0-9]{10}$/.test(String(input.asin))) throw new Error('ASIN inválido.');
    const item=await amazonRequest(`/catalog/2022-04-01/items/${encodeURIComponent(String(input.asin))}`,{marketplaceIds:config.marketplaceId,includedData,locale:'en_US'});
    return {items:[item],identity_basis:'ASIN',automatic_link:false};
  }
  if (!input.gtin) throw new Error('Informe GTIN ou ASIN para procurar identidade exata; título parecido não comprova identidade.');
  const type=String(input.id_type || 'GTIN').toUpperCase();
  if (!['GTIN','EAN','UPC','ISBN','JAN'].includes(type) || !/^\d{8,14}$/.test(String(input.gtin))) throw new Error('Identificador de catálogo inválido.');
  const result=await amazonRequest('/catalog/2022-04-01/items',{identifiers:String(input.gtin),identifiersType:type,marketplaceIds:config.marketplaceId,includedData,locale:'en_US',pageSize:'20'});
  return {...result,identity_basis:type,automatic_link:false};
}
export async function amazonFees(input: ProductInput) {
  const target=amazonFeeTarget(input,amazonConfig());
  return amazonRequest(`/products/fees/v0/${target.id_type==='ASIN'?'items':'listings'}/${encodeURIComponent(target.id_value)}/feesEstimate`,{},'POST',{FeesEstimateRequest:{MarketplaceId:target.marketplace_id,IsAmazonFulfilled:target.fulfillment==='FBA',Identifier:target.request_identifier,PriceToEstimateFees:{ListingPrice:{CurrencyCode:'USD',Amount:target.price},Shipping:{CurrencyCode:'USD',Amount:target.shipping_charge}}}});
}
