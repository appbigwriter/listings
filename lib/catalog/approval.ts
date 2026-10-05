import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Channel, ChannelListing, ProductInput } from './model';
import { contentHash } from './model';

function secret() {
  const value = process.env.PRELISTING_REVIEW_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.AUTH_GATEWAY_SECRET;
  if (value) return value;
  if (process.env.NODE_ENV === 'test') return 'local-test-review-secret';
  throw new Error('Configure PRELISTING_REVIEW_SECRET antes de aprovar produtos.');
}
function signature(product: ProductInput, channel: Channel, approval: NonNullable<ChannelListing['approval']>) {
  return createHmac('sha256', secret()).update(JSON.stringify([product.sku, channel, approval.hash, approval.actor, approval.approved_at])).digest('hex');
}
export function approveVersion(product: ProductInput, channel: Channel, actor: string) {
  const approval = { hash: contentHash(product, channel), actor, approved_at: new Date().toISOString() };
  return { ...approval, signature: signature(product, channel, approval) };
}
export function approvalValid(product: ProductInput, channel: Channel) {
  const approval = product._catalog?.channels[channel]?.approval;
  if (!approval || approval.hash !== contentHash(product, channel) || !/^[a-f0-9]{64}$/.test(approval.signature || '')) return false;
  try { return timingSafeEqual(Buffer.from(approval.signature!, 'hex'), Buffer.from(signature(product, channel, approval), 'hex')); } catch { return false; }
}
