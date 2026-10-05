import { parse } from 'csv-parse/sync';
import { createCatalog, draftIssues, hash, TECHNICAL_FIELDS, type ProductInput } from './model';

export function parseCatalog(text: string, format: 'json' | 'csv'): Record<string, unknown>[] {
  if (Buffer.byteLength(text) > 5_000_000) throw new Error('Importação limitada a 5 MB.');
  const parsed = format === 'json' ? JSON.parse(text) : parse(text, { columns: true, bom: true, skip_empty_lines: true, max_record_size: 100000 });
  const rows = Array.isArray(parsed) ? parsed : parsed.products || parsed.data;
  if (!Array.isArray(rows) || rows.length > 5000 || rows.some(row => !row || typeof row !== 'object' || Array.isArray(row))) throw new Error('Informe até 5.000 produtos em um array JSON ou CSV com cabeçalhos.');
  return rows;
}
export function normalizeImportedProduct(row: Record<string, unknown>, sourceId: string): ProductInput {
  const sku = String(row.sku || row.code || row.id || '').trim();
  const input: ProductInput = { sku, title: String(row.title || row.name || '').trim(), brand: row.brand || '', manufacturer: row.manufacturer || '',
    description: row.description || '', price: row.price ?? row.base_price ?? '', qty: row.qty ?? row.stock_quantity ?? '',
    images: row.images || row.image_url || row.image || '', source_url: row.source_url || '', source_platform: sourceId,
    template_key: 'fbrsigns_sign', template_version: '2026-01', origin: row.origin || '', fulfillment: row.fulfillment || '',
    product_type: '', category: '', relationship: row.parent_sku ? 'Child' : row.relationship === 'Parent' || Array.isArray(row.variants) && row.variants.length ? 'Parent' : 'Standalone', parent_sku: row.parent_sku || '', human_reviewed: false,
    id_type: row.id_type || 'UPC', gtin: row.gtin || '', asin: row.asin || '', ...Object.fromEntries(TECHNICAL_FIELDS.filter(key => row[key] !== undefined).map(key => [key, row[key]])) };
  const catalog = createCatalog(input);
  const now = new Date().toISOString();
  catalog.source = { id: sourceId, hash: hash(row), imported_at: now, snapshot: row };
  for (const field of TECHNICAL_FIELDS) if (input[field] !== undefined && input[field] !== '') catalog.facts[field] = { value: input[field], source: sourceId, status: 'pending', observed_at: now };
  catalog.kind = row.kind === 'service' || row.kind === 'physical' || row.kind === 'custom' ? row.kind : 'unknown';
  if (Array.isArray(row.variants)) catalog.variants = row.variants.map((v: Record<string, unknown>) => ({ sku: String(v.sku || v.id || ''), attributes: Object.fromEntries(Object.entries(v).filter(([key]) => key !== 'sku' && key !== 'id')) }));
  input._catalog = catalog;
  if (draftIssues(input).length) throw new Error(`Produto ${sku || '(sem SKU)'} precisa de SKU e título.`);
  return input;
}
export function previewImport(rows: Record<string, unknown>[], sourceId: string) {
  const seen = new Set<string>();
  return rows.map((row, index) => {
    try { const product = normalizeImportedProduct(row, sourceId); const sku = String(product.sku); if (seen.has(sku)) throw new Error(`SKU duplicado no arquivo: ${sku}.`); seen.add(sku); return { index, product, error: null }; }
    catch (error) { return { index, product: null, error: error instanceof Error ? error.message : 'Produto inválido.' }; }
  });
}
