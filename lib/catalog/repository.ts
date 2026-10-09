import type { SupabaseClient } from '@supabase/supabase-js';
import type { AuthContext } from '../auth';
import { getActiveListing } from './active-listing';
import { createCatalog, draftIssues, hash, type ProductInput } from './model';
import {recordFieldSource} from './field-provenance';

export class CatalogError extends Error { constructor(message: string, public status = 400) { super(message);this.name='CatalogError'; } }
const SERVER_PRODUCT_FIELDS=new Set(['__proto__','constructor','prototype','_catalog','human_reviewed','review_hash','source_snapshot','source_update','source_resolution','archive_transition','amazon_preview','amazon_fees','amazon_discovery','amazon_restrictions','amazon_research','ai_grounding','submission','archived_at','owner_id','organization_id','id','status','created_at','updated_at']);
export function editableProductPatch(body:Record<string,unknown>):Record<string,unknown>{
 return Object.fromEntries(Object.entries(body).filter(([field])=>!SERVER_PRODUCT_FIELDS.has(field)));
}
export function scopeQuery(query: any, auth: AuthContext): any { return query.eq('organization_id',auth.organizationId).eq('owner_id',auth.userId); }
export function productFromRow(row: Record<string, any>): ProductInput {
  const input = { ...row.payload, sku: row.sku, title: row.title, brand: row.brand, human_reviewed: row.human_reviewed };
  input._catalog = createCatalog(input, row.payload?._catalog);
  return input;
}
export async function loadProduct(db: SupabaseClient, auth: AuthContext, sku: string) {
  const result = await getActiveListing(db, auth, sku);
  if (result.error) throw new CatalogError('Falha ao buscar o produto.', 503);
  if (!result.listing || result.archived) throw new CatalogError('SKU ativo não encontrado.', 404);
  return { row: result.listing, product: productFromRow(result.listing) };
}
export async function persistProduct(db: SupabaseClient, auth: AuthContext, input: ProductInput, previous?: Record<string, any>) {
  const errors = draftIssues(input); if (errors.length) throw new CatalogError(errors.join(', '));
  const row = { sku: String(input.sku).trim(), title: String(input.title).trim(), brand: String(input.brand || ''), payload: input,
    source_url: input.source_url || null, source_platform: input.source_platform || null, source_snapshot: input._catalog?.source?.snapshot || input.source_snapshot || null,
    template_key: input.template_key || null, template_version: input.template_version || null, human_reviewed: input.human_reviewed === true,
    status: input.human_reviewed === true ? 'ready' : 'draft', updated_at: new Date(Math.max(Date.now(), previous ? Date.parse(previous.updated_at) + 1 : 0)).toISOString(), owner_id: auth.userId, organization_id: auth.organizationId };
  if (!previous) {
    const result = await db.from('prelistings').insert(row).select('*').single();
    if (result.error) throw new CatalogError(result.error.code === '23505' ? 'SKU já existe nesta organização.' : 'Falha ao salvar o produto.', result.error.code === '23505' ? 409 : 503);
    return result.data;
  }
  const result = await scopeQuery(db.from('prelistings').update(row), auth).eq('id', previous.id).eq('updated_at', previous.updated_at).neq('status', 'archived').select('*').maybeSingle();
  if (result.error) throw new CatalogError('Falha ao atualizar o produto.', 503);
  if (!result.data) throw new CatalogError('O SKU mudou durante a operação. Recarregue antes de tentar novamente.', 409);
  return result.data;
}
export function mergeDraft(current: ProductInput, body: Record<string, unknown>,actor?:string): ProductInput {
  // Server-owned schemas, approvals, source snapshots and media checks never come from client patches.
  const patch=editableProductPatch(body);
  const next: ProductInput = { ...current, ...patch, sku: current.sku, _catalog: structuredClone(current._catalog || createCatalog(current)) };
  const catalog = next._catalog!;
  for(const field of Object.keys(patch))if(field!=='sku'&&hash(current[field])!==hash(next[field]))recordFieldSource(next,field,{authority:'human',...(actor?{actor}:{})});
  for (const [field, fact] of Object.entries(catalog.facts)) {
    const value=field.startsWith('ebay.aspect.')?catalog.channels['ebay-us']?.attributes[field.slice('ebay.aspect.'.length)]:next[field];
    if (hash(fact.value) !== hash(value)) catalog.facts[field] = { ...fact, value, status: 'pending' };
  }
  if (hash(patch) !== hash({})) {
    next.human_reviewed = false;
    for (const listing of Object.values(catalog.channels)) if (listing) { delete listing.approval; delete listing.report; }
  }
  return next;
}
