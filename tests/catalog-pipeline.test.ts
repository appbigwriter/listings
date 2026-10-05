import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import * as repository from '../lib/catalog/repository';
import { assertFamily } from '../lib/catalog/family';
import { readFileSync } from 'node:fs';
import { parseCatalog, previewImport } from '../lib/catalog/import';
import { contentHash, createCatalog, hash, type ProductInput } from '../lib/catalog/model';
import { mergeDraft } from '../lib/catalog/repository';
import { evaluateReadiness } from '../lib/catalog/readiness';
import { validateSchema } from '../lib/catalog/schema';
import { validateAiListingResponse } from '../lib/ai/contracts';
import { amazonAttributes, amazonPayload } from '../lib/marketplaces/amazon';
import { validateListing, buildSellerExport } from '../lib/catalog/contracts';
import { applyAction, buildChannelPackage } from '../lib/catalog/actions';

const auth = { userId: 'reviewer', organizationId: 'org', mode: 'local-only' } as const;
function readyProduct(): ProductInput {
  const input: ProductInput = { sku: 'FBR-TEST', title: 'Aluminum Sign', brand: 'FBRSigns', origin: 'United States', material: 'Aluminum', product_type: 'SIGN', category: 'signs', gtin: '123456789012', id_type: 'UPC', pkg_length: '10', pkg_width: '8', pkg_height: '2', pkg_weight: '3', qty: '0', price: '20', images: 'https://example.com/main.jpg', fulfillment: 'FBM', assets_reviewed: true, policy_reviewed: true, human_reviewed: false, template_key: 'fbrsigns_sign', template_version: '2026-01' };
  const catalog = createCatalog(input); catalog.kind = 'physical'; catalog.eligibility_confirmed = true;
  for (const field of ['brand', 'origin', 'material', 'pkg_length', 'pkg_width', 'pkg_height', 'pkg_weight']) catalog.facts[field] = { value: input[field], source: 'fixture measurement', status: 'confirmed', observed_at: new Date().toISOString() };
  const schema = { type: 'object', required: ['item_name'], properties: { item_name: { type: 'array', minItems: 1 } } };
  catalog.channels['amazon-us'] = { product_type: 'SIGN', category: 'signs', attributes: {}, schema: { channel: 'amazon-us', product_type: 'SIGN', category: 'signs', version: 'fixture-v1', fetched_at: new Date().toISOString(), checksum: hash(schema), schema } };
  catalog.media = [{ url: 'https://example.com/main.jpg', width: 1500, height: 1500, format: 'jpeg', sha256: 'fixture', checked_at: new Date().toISOString() }]; input._catalog = catalog;
  return input;
}
describe('catalog preparation pipeline', () => {
  it('parses quoted CSV, BOM, multiline descriptions and detects duplicate SKUs', () => {
    const rows = parseCatalog('\ufeffsku,title,description\r\nA,"Sign, blue","Line 1\nLine 2"\r\nA,Other,Text', 'csv');
    expect(rows[0].description).toBe('Line 1\nLine 2');
    expect(previewImport(rows, 'file')[1].error).toContain('duplicado');
  });
  it('normalizes 20 public FBR products without inventing packaged measurements or approval', () => {
    const rows = JSON.parse(readFileSync('tests/fixtures/catalog-source-sample.json', 'utf8'));
    expect(rows).toHaveLength(20);
    const preview = previewImport(rows, 'public-source');
    expect(preview.every(item => item.product)).toBe(true);
    for (const item of preview) { expect(item.product!.human_reviewed).toBe(false); expect(item.product!._catalog!.source!.hash).toBe(hash(rows[item.index])); expect(evaluateReadiness(item.product!).ready).toBe(false); }
  });
  it('keeps a reviewed version valid across report updates but invalidates changed content and channel attributes', () => {
    const product = readyProduct(); const before = contentHash(product);
    product._catalog!.channels['amazon-us']!.report = { ready: false, issues: [], checked_at: new Date().toISOString() };
    expect(contentHash(product)).toBe(before);
    const next = mergeDraft(product, { pkg_weight: '4', _catalog: { channels: { 'amazon-us': { approval: { hash: 'attacker' } } } } });
    expect(next._catalog!.facts.pkg_weight.status).toBe('pending'); expect(next.human_reviewed).toBe(false);
    expect(contentHash(next)).not.toBe(before); expect(next._catalog!.channels['amazon-us']!.approval).toBeUndefined();
  });
  it('requires complete readiness before recording an approval and binds the authenticated reviewer to the hash', async () => {
    const product = readyProduct(); expect(evaluateReadiness(product, 'amazon-us', false).ready).toBe(true);
    await expect(applyAction(product, auth, 'review', { expected_hash: 'outdated' })).rejects.toThrow('versão');
    const result = await applyAction(product, auth, 'review', { expected_hash: contentHash(product) });
    expect(result.report.ready).toBe(true); expect(result.product._catalog!.channels['amazon-us']!.approval?.actor).toBe('reviewer');
    expect(buildChannelPackage(result.product, 'amazon-us').payload).toMatchObject({ productType: 'SIGN' });
    const tampered = structuredClone(result.product); tampered._catalog!.channels['amazon-us']!.approval!.actor = 'forged';
    expect(evaluateReadiness(tampered).ready).toBe(false);
    result.product.title = 'Changed title'; expect(() => buildChannelPackage(result.product, 'amazon-us')).toThrow('version_review_required');
  });
  it('blocks custom FBA, stale schemas, source changes, services and unreviewed image rights', () => {
    const product = readyProduct(); product._catalog!.kind = 'custom'; product.fulfillment = 'FBA'; product.source_update = { hash: 'changed' }; product.assets_reviewed = false;
    product._catalog!.channels['amazon-us']!.schema!.fetched_at = '2020-01-01';
    expect(evaluateReadiness(product).issues.map(issue => issue.code)).toEqual(expect.arrayContaining(['custom_fbm_required', 'schema_expired', 'media_review_required', 'source_reconciliation_required']));
    product._catalog!.kind = 'service'; expect(evaluateReadiness(product).issues.map(issue => issue.code)).toContain('service_excluded');
  });
  it('validates conditional requirements, UTF8 length and Amazon selector uniqueness', () => {
    const schema = { type: 'object', properties: { powered: { type: 'boolean' }, label: { type: 'string', maxUtf8ByteLength: 4 }, values: { type: 'array', selectors: ['language'], minUniqueItems: 2, maxUniqueItems: 2 } }, if: { properties: { powered: { const: true } } }, then: { required: ['voltage'] } };
    expect(validateSchema(schema, { powered: true, label: 'ééé', values: [{ language: 'en', value: 1 }, { language: 'en', value: 2 }] }).map(issue => issue.code)).toEqual(expect.arrayContaining(['schema_required', 'schema_maxUtf8ByteLength', 'schema_minUniqueItems']));
    expect(validateSchema({ $ref: 'https://untrusted.invalid/schema' }, {})).toMatchObject([{ code: 'schema_unsupported' }]);
    expect(validateSchema({ type: 'object', unrecognizedConstraint: true }, {})).toMatchObject([{ code: 'schema_unsupported' }]);
  });
  it('allows audited editorial rewriting, rejects unsupported numbers and locks technical fields', () => {
    const input = { fbrFacts: { title: 'Aluminum sign', material: 'Aluminum', pkg_width: '8 inches' } };
    expect(validateAiListingResponse({ title: 'Sign made of Aluminum' }, input, true).ok).toBe(true);
    expect(validateAiListingResponse({ title: '10 inch Aluminum sign' }, input, true)).toMatchObject({ ok: false });
    expect(validateAiListingResponse({ material: 'Steel' }, input, true)).toMatchObject({ ok: false });
  });
  it('distinguishes zero stock from invalid stock and rejects invalid GTIN checksums', () => {
    const product = readyProduct(); expect(validateListing({ ...product, human_reviewed: true }).valid).toBe(true);
    expect(validateListing({ ...product, gtin: '123456789013', human_reviewed: true }).errors).toContain('gtin_invalid');
    expect(validateListing({ ...product, qty: '-1', human_reviewed: true }).errors).toContain('offer_required');
    expect(buildSellerExport({ ...product, human_reviewed: true }).csv).toContain('123456789012');
  });
  it('maps packaged dimensions with explicit units without substituting item dimensions', () => {
    const product = readyProduct(); product.dimensions = '33 x 80';
    expect(amazonAttributes(product).item_package_dimensions).toMatchObject([{ length: { value: 10, unit: 'inches' }, width: { value: 8, unit: 'inches' } }]);
    expect(amazonPayload(product).productType).toBe('SIGN');
  });
  it('keeps technical overrides consistent, removes generated duplicates and maps variant families', async () => {
    const product = readyProduct();
    const result = await applyAction(product, auth, 'configure', { attributes: amazonAttributes(product) });
    expect(result.product._catalog!.channels['amazon-us']!.attributes).toEqual({});
    result.product._catalog!.channels['amazon-us']!.attributes.brand = [{ value: 'Different', marketplace_id: 'ATVPDKIKX0DER' }];
    expect(evaluateReadiness(result.product).issues.map(issue => issue.code)).toContain('attribute_conflict');
    product.relationship = 'Child'; product.parent_sku = 'PARENT'; product.variation = 'SIZE/COLOR';
    expect(amazonAttributes(product).child_parent_sku_relationship).toMatchObject([{ parent_sku: 'PARENT', child_relationship_type: 'variation' }]);
    expect(amazonAttributes(product).variation_theme).toMatchObject([{ name: 'SIZE/COLOR' }]);
    await expect(applyAction(product, auth, 'submit')).rejects.toThrow('executor');
  });
  it('checks live parent coherence before releasing children and keeps parent rows non-buyable', async () => {
    const parent = readyProduct(); parent.relationship = 'Parent'; parent.sku = 'PARENT'; parent.variation = 'SIZE/COLOR';
    parent.gtin = ''; parent.pkg_weight = ''; parent.price = ''; parent.qty = '';
    expect(validateListing({ ...parent, human_reviewed: true }).valid).toBe(true);
    expect(amazonAttributes(parent).purchasable_offer).toBeUndefined();
    const child = readyProduct(); child.relationship = 'Child'; child.parent_sku = 'PARENT'; child.variation = 'SIZE/COLOR';
    const mock = vi.spyOn(repository, 'loadProduct').mockResolvedValue({ product: parent, row: {} });
    try {
      await expect(assertFamily({} as SupabaseClient, auth, child, 'amazon-us')).resolves.toBeUndefined();
      parent.variation = 'COLOR';
      await expect(assertFamily({} as SupabaseClient, auth, child, 'amazon-us')).rejects.toThrow('família');
      expect(mock).toHaveBeenCalledWith(expect.anything(), auth, 'PARENT');
    } finally { mock.mockRestore(); }
  });
});
