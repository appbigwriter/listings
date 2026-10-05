import { hash, type Channel, type SchemaSnapshot } from '../catalog/model';
import { amazonCategories, amazonSchema } from './amazon';
import { marketplaceToken } from './oauth';
import { readResponseWithLimit } from '../extract-security';

async function ebay(path: string) {
  const response = await fetch(`https://api.ebay.com${path}`, { redirect:'error', signal: AbortSignal.timeout(15000), headers: { authorization: `Bearer ${await marketplaceToken('ebay')}`, 'accept-language': 'en-US' } });
  if (!response.ok) throw new Error(`eBay respondeu HTTP ${response.status}.`);
  return JSON.parse(await readResponseWithLimit(response,5_000_000));
}
async function walmart(path: string, method = 'GET', body?: unknown) {
  const response = await fetch(`https://marketplace.walmartapis.com${path}`, { method, redirect:'error', signal: AbortSignal.timeout(15000), headers: { 'WM_SEC.ACCESS_TOKEN': await marketplaceToken('walmart'), ...(process.env.WALMART_CONSUMER_CHANNEL_TYPE ? { 'WM_CONSUMER.CHANNEL.TYPE': process.env.WALMART_CONSUMER_CHANNEL_TYPE } : {}), 'WM_QOS.CORRELATION_ID': crypto.randomUUID(), 'WM_SVC.NAME': 'Walmart Marketplace', accept: 'application/json', 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  if (!response.ok) throw new Error(`Walmart respondeu HTTP ${response.status}.`);
  return JSON.parse(await readResponseWithLimit(response,5_000_000));
}
export async function categorySuggestions(channel: Channel, title: string) {
  if (channel === 'amazon-us') return amazonCategories(title);
  if (channel === 'ebay-us') {
    const tree = await ebay('/commerce/taxonomy/v1/get_default_category_tree_id?marketplace_id=EBAY_US');
    const result = await ebay(`/commerce/taxonomy/v1/category_tree/${tree.categoryTreeId}/get_category_suggestions?q=${encodeURIComponent(title)}`);
    return (result.categorySuggestions || []).map((v: { category: { categoryId: string; categoryName: string } }) => ({ id: v.category.categoryId, name: v.category.categoryName }));
  }
  if (channel === 'walmart-us') {
    const result = await walmart('/v3/items/taxonomy');
    const entries: { id: string; name: string }[] = [];
    const walk = (v: unknown) => { if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') { const item = v as Record<string, unknown>; if (typeof item.productTypeName === 'string') entries.push({ id: item.productTypeName, name: item.productTypeName }); Object.values(item).forEach(walk); } };
    walk(result);
    const words = title.toLowerCase().split(/\W+/).filter(v => v.length > 2);
    return [...new Map(entries.map(v => [v.id, v])).values()].sort((a, b) => words.filter(w => b.name.toLowerCase().includes(w)).length - words.filter(w => a.name.toLowerCase().includes(w)).length).slice(0, 20);
  }
  throw new Error('TikTok Shop requer integração específica antes da classificação.');
}
export async function channelSchema(channel: Channel, productType: string, category: string, parentage: string): Promise<SchemaSnapshot> {
  if (channel === 'amazon-us') return amazonSchema(productType, category, parentage);
  if (channel === 'ebay-us') {
    const tree = await ebay('/commerce/taxonomy/v1/get_default_category_tree_id?marketplace_id=EBAY_US');
    const result = await ebay(`/commerce/taxonomy/v1/category_tree/${tree.categoryTreeId}/get_item_aspects_for_category?category_id=${encodeURIComponent(category)}`);
    const required: string[] = []; const properties: Record<string, unknown> = {};
    for (const aspect of result.aspects || []) {
      const constraint = aspect.aspectConstraint || {}; const name = aspect.localizedAspectName;
      if (constraint.aspectRequired) required.push(name);
      const values = (aspect.aspectValues || []).map((v: { localizedValue: string }) => v.localizedValue);
      properties[name] = { type: 'array', minItems: 1, ...(constraint.itemToAspectCardinality === 'SINGLE' ? { maxItems: 1 } : {}), items: { type: 'string', ...(constraint.aspectMode === 'SELECTION_ONLY' && values.length ? { enum: values } : {}), ...(constraint.aspectMaxLength ? { maxLength: constraint.aspectMaxLength } : {}) } };
    }
    const schema = { type: 'object', properties, required, additionalProperties: false };
    return { channel, category, product_type: productType, version: String(tree.categoryTreeVersion || hash(result)), fetched_at: new Date().toISOString(), checksum: hash(schema), schema };
  }
  if (channel === 'walmart-us') {
    if (!process.env.WALMART_SPEC_VERSION) throw new Error('Configure a versão Get Spec vigente da sua conta Walmart.');
    const result = await walmart('/v3/items/spec', 'POST', { feedType: process.env.WALMART_FEED_TYPE || 'MP_ITEM', version: process.env.WALMART_SPEC_VERSION, productTypes: [productType] });
    const schema = result.schema || result;
    if (!schema.properties && !schema.$ref) throw new Error('Walmart não retornou um schema JSON reconhecido; verifique a versão Get Spec da conta.');
    return { channel, category, product_type: productType, version: String(result.version || hash(schema)), fetched_at: new Date().toISOString(), checksum: hash(schema), schema };
  }
  throw new Error('Schema indisponível para este canal.');
}
