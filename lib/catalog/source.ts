import { createClient } from '@supabase/supabase-js';
import { publicFetch } from '../net/public-fetch';

export async function fetchSourceCatalog(): Promise<Record<string, unknown>[]> {
  if (process.env.FBR_SOURCE_SUPABASE_URL && process.env.FBR_SOURCE_SUPABASE_ANON_KEY) {
    const url = new URL(process.env.FBR_SOURCE_SUPABASE_URL);
    if (url.protocol !== 'https:' || !url.hostname.endsWith('.supabase.co')) throw new Error('Fonte Supabase inválida.');
    const client = createClient(url.href, process.env.FBR_SOURCE_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const rows: Record<string, unknown>[] = [];
    for (let offset = 0; offset < 5000; offset += 500) {
      const { data, error } = await client.from('products').select('*,product_variants(*)').order('id').range(offset, offset + 499);
      if (error) throw new Error('Não foi possível ler o catálogo público da FBRSigns. Confira a fonte e as permissões.');
      for (const product of data || []) {
        const images = [product.image_url, ...(product.additional_images || [])].filter(Boolean);
        const variants = (product.product_variants || []).map((variant: Record<string, unknown>) => ({ ...variant, sku: variant.sku || `FBR-${variant.id}` }));
        const parent = { ...product, sku: product.sku || `FBR-${product.id}`, relationship: variants.length ? 'Parent' : 'Standalone', description: product.detailed_description || product.description || '', images, variants };
        rows.push(parent);
        for (const variant of variants) rows.push({ ...parent, ...variant, relationship:'Child', id: variant.id, parent_sku: parent.sku, name: product.name, price: Number(product.price) + Number(variant.additional_price || 0), images: variant.image_url ? [variant.image_url, ...images] : images, variants: [] });
      }
      if ((data || []).length < 500) return rows;
    }
    throw new Error('Catálogo acima do limite de importação; configure paginação da fonte.');
  }
  const url = process.env.SOURCE_CATALOG_URL;
  if (!url) throw new Error('Configure a fonte do catálogo ou importe um arquivo CSV/JSON.');
  const { body } = await publicFetch(url, { allowedHosts: (process.env.SOURCE_CATALOG_ALLOWED_HOSTS || new URL(url).hostname).split(',').map(value => value.trim()), headers: process.env.SOURCE_CATALOG_TOKEN ? { authorization: `Bearer ${process.env.SOURCE_CATALOG_TOKEN}` } : undefined });
  const result = JSON.parse(body);
  const products = Array.isArray(result) ? result : result.products || result.data;
  if (!Array.isArray(products) || products.length > 5000) throw new Error('Fonte precisa retornar até 5.000 produtos; use CSV/JSON paginado para volumes maiores.');
  return products;
}
