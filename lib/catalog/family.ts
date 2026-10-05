import type { SupabaseClient } from '@supabase/supabase-js';
import type { AuthContext } from '../auth';
import type { Channel, ProductInput } from './model';
import { CatalogError, loadProduct } from './repository';

export async function assertFamily(db: SupabaseClient, auth: AuthContext, product: ProductInput, channel: Channel) {
  if (product.relationship !== 'Child') return;
  if (!product.parent_sku || product.parent_sku === product.sku) throw new CatalogError('Informe um SKU pai diferente do filho.', 422);
  const parent = (await loadProduct(db, auth, String(product.parent_sku))).product;
  if (parent.relationship !== 'Parent' || !product.variation || parent.variation !== product.variation || parent._catalog?.channels[channel]?.product_type !== product._catalog?.channels[channel]?.product_type) throw new CatalogError('A família exige um SKU pai ativo, vínculo Parent, mesmo tema de variação e mesmo tipo de produto no canal.', 422);
}
