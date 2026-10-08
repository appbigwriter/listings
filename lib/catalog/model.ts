import { createHash } from 'node:crypto';

import { CHANNELS, CHANNEL_LABELS, type Channel } from './channels';
export { CHANNELS, CHANNEL_LABELS, type Channel } from './channels';
export type ProductKind = 'physical' | 'custom' | 'service' | 'unknown';
export type Fact = { value: unknown; source: string; status: 'confirmed' | 'pending'; observed_at: string };
export type FieldSource = { authority:'source'|'human';source_id?:string;source_hash?:string;actor?:string;observed_at:string;value_hash:string };
export type Issue = { code: string; field: string; message: string; severity: 'error' | 'warning'; action: string };
export type SchemaSnapshot = { channel: Channel; category: string; product_type: string; version: string; fetched_at: string; checksum: string; schema: Record<string, unknown>;metadata?:{category_tree_id:string;taxonomy:import('../marketplaces/ebay-advanced-aspects').EbayTaxonomyAspects} };
export type MediaCheck = { url: string; checked_at: string; width: number; height: number; format: string; sha256: string };
export type ChannelListing = {
  product_type: string; category: string; attributes: Record<string, unknown>;
  copy?: {locale:'en_US';title:string;bullets:string;description:string;keywords:string;source:'human'|'ai';grounding?:unknown};
  schema?: SchemaSnapshot; suggestions?: { id: string; name: string }[];
  schema_change?: ReturnType<typeof import('./schema-change').schemaChange>;
  schema_refresh_pending?: {event_id:string;requested_at:string;product_type_version:string};
  family?: {variation_aspects:string[];image_variation_aspect:string};
  recommendation?: { id: string; confidence: number; reason: string; accepted?: boolean };
  approval?: { hash: string; actor: string; approved_at: string; signature?: string };
  offer_authority?: OfferAuthority;
  report?: { ready: boolean; issues: Issue[]; checked_at: string };
  submission?: { status: string; request_hash: string; submitted_at: string; response?: unknown; issues?: unknown; publication_status: string;verified_content_hash?:string;verified_at?:string;trace?:Record<string,unknown> };
};
export type OfferAuthority={version:1;sku:string;owner_id:string;organization_id:string;channel:Channel;seller_id:string;marketplace_id:string;source:'prelisting';status:'active'|'paused';fields:('price'|'qty')[];values_hash:string;content_hash:string;actor:string;reason:string;recorded_at:string;expires_at:string;signature:string};
export type CatalogDocument = {
  version: 1; product_id: string; kind: ProductKind; eligibility_confirmed: boolean;
  facts: Record<string, Fact>; variants: { sku: string; attributes: Record<string, unknown> }[];
  channels: Partial<Record<Channel, ChannelListing>>; media: MediaCheck[];
  source?: { id: string; hash: string; imported_at: string; snapshot: Record<string, unknown> };
  field_sources?: Record<string,FieldSource>;
};
export type ProductInput = Record<string, unknown> & { sku?: string; title?: string; _catalog?: CatalogDocument };
export const COPY_FIELDS=['title','bullets','description','keywords'] as const;
/** Legacy drafts fall back to shared text until a channel copy is explicitly saved/generated. */
export function channelProduct(input:ProductInput,channel:Channel):ProductInput {
 const copy=input._catalog?.channels[channel]?.copy;
 return copy?{...input,...Object.fromEntries(COPY_FIELDS.map(field=>[field,copy[field]]))}:input;
}
export const TECHNICAL_FIELDS = ['brand', 'manufacturer', 'origin', 'material', 'color', 'included', 'pkg_length', 'pkg_width', 'pkg_height', 'pkg_weight', 'gtin', 'mpn', 'compliance'] as const;
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}
export const hash = (value: unknown) => createHash('sha256').update(stableStringify(value)).digest('hex');
export function contentHash(input: ProductInput, channel: Channel = 'amazon-us') {
  const { _catalog, human_reviewed, review_hash,amazon_fees,amazon_discovery,amazon_restrictions,ai_grounding, ...fields } = channelProduct(input,channel);
  const listing = _catalog?.channels[channel];
  return hash({ fields, kind: _catalog?.kind, eligibility_confirmed: _catalog?.eligibility_confirmed, facts: _catalog?.facts, variants: _catalog?.variants,
    listing: listing && { product_type: listing.product_type, category: listing.category, attributes: listing.attributes, schema_checksum: listing.schema?.checksum,...(listing.schema?.metadata?{schema_metadata_hash:hash(listing.schema.metadata)}:{}),...(listing.family?{family:listing.family}:{}),...(listing.copy?{locale:listing.copy.locale}:{}) }, media: _catalog?.media });
}
export function channelFrom(value: unknown): Channel {
  if (CHANNELS.includes(value as Channel)) return value as Channel;
  return Object.entries(CHANNEL_LABELS).find(([, label]) => label === value)?.[0] as Channel || 'amazon-us';
}
export function createCatalog(input: ProductInput, previous?: CatalogDocument): CatalogDocument {
  return previous ?? { version: 1, product_id: String(input.product_id || input.parent_sku || input.sku || ''), kind: 'unknown', eligibility_confirmed: false,
    facts: {}, variants: [], media: [], channels: { 'amazon-us': { product_type: String(input.product_type || ''), category: String(input.category || ''), attributes: {} } } };
}
export function draftIssues(input: ProductInput): string[] {
  return [!String(input.sku || '').trim() && 'sku_required', !String(input.title || '').trim() && 'title_required'].filter(Boolean) as string[];
}
export function isChannel(value: unknown): value is Channel { return CHANNELS.includes(value as Channel); }
