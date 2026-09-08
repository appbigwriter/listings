import { calculateMargin, type Margin, type MarketingCosts } from './margin';

export const MARKETING_STATUSES = ['draft','research_ready','campaign_plan_ready','tracking_ready','approval_pending','launch_ready','launched','optimizing','paused'] as const;
export type MarketingStatus = typeof MARKETING_STATUSES[number];
export type MarketingInput = { sku?: string; title?: string; price?: string|number; qty?: string|number; asin?: string; amazon_url?: string; images?: string|string[]; [key:string]: unknown };
const SKU = /^[A-Z0-9]+(?:-[A-Z0-9]+){1,}$/i;
export function validateMarketingInput(input: MarketingInput) {
  const errors: string[] = [];
  if (!input.sku || !SKU.test(String(input.sku).trim())) errors.push('sku_invalid');
  if (!String(input.title || '').trim()) errors.push('title_required');
  if (!Number.isFinite(Number(input.price)) || Number(input.price) <= 0) errors.push('price_required');
  if (!Number.isFinite(Number(input.qty)) || Number(input.qty) <= 0) errors.push('stock_required');
  const images = Array.isArray(input.images) ? input.images : String(input.images || '').split(/\n+/).filter(Boolean);
  if (!images.length || !/^https?:\/\//i.test(images[0])) errors.push('primary_image_required');
  if (input.amazon_url && !isAmazonUrl(String(input.amazon_url))) errors.push('amazon_url_invalid');
  return { valid: errors.length === 0, errors };
}
export function isAmazonUrl(value: string) { try { const u = new URL(value); return /(^|\.)amazon\.(com|ca|com\.mx)$/i.test(u.hostname) && !!u.pathname; } catch { return false; } }
export function buildReadinessGate(input: MarketingInput, margin?: Margin) {
  const blockers = validateMarketingInput(input).errors.filter(x => ['price_required','stock_required','primary_image_required'].includes(x));
  if (!input.asin && !input.amazon_url) blockers.push('asin_or_offer_required');
  if (!margin) blockers.push('real_margin_required');
  return { ready: blockers.length === 0, blockers: [...new Set(blockers)], checked_at: new Date().toISOString() };
}
export function safeMargin(input: MarketingInput, costs?: MarketingCosts) { if (!costs) return undefined; try { return calculateMargin(input.price || 0, costs); } catch { return undefined; } }
