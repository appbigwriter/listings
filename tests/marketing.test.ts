import { describe, expect, it } from 'vitest';
import { calculateMargin } from '../lib/marketing/margin';
import { buildReadinessGate, validateMarketingInput } from '../lib/marketing/validation';
import { buildAmazonPlan, buildMetaPlan, buildTrackingPlan, buildKanbanCards } from '../lib/marketing/plans';

const product = {
  sku: 'FBR-ROLLUP-001', title: 'Custom Roll Up Banner', price: '249.00', qty: '10',
  asin: 'B012345678', images: 'https://cdn.example/main.jpg\nhttps://cdn.example/detail.jpg',
  keywords: 'roll up banner, retractable banner, trade show display',
};
const costs = { product_cost: 62, printing_cost: 18, packaging_cost: 7, shipping_cost: 24, amazon_referral_fee: 37.35, fulfillment_fee: 0, other_costs: 5, currency: 'USD' as const };

describe('marketing domain', () => {
  it('calculates the approved margin formula without rounding inputs', () => {
    expect(calculateMargin(249, costs)).toMatchObject({ revenue: 249, total_cost: 153.35, profit: 95.65, percentage: 38.41, currency: 'USD' });
  });
  it('rejects incomplete costs instead of assuming zero', () => {
    expect(() => calculateMargin(249, { ...costs, shipping_cost: undefined })).toThrow(/shipping_cost/);
  });
  it('returns explicit launch blockers for missing offer, image, stock and margin', () => {
    const gate = buildReadinessGate({ ...product, price: '', qty: '0', asin: '', images: '' }, undefined);
    expect(gate.ready).toBe(false);
    expect(gate.blockers).toEqual(expect.arrayContaining(['price_required', 'stock_required', 'primary_image_required', 'asin_or_offer_required', 'real_margin_required']));
  });
  it('validates SKU and Amazon URLs', () => {
    expect(validateMarketingInput({ ...product, sku: 'bad sku', amazon_url: 'https://example.com/item' }).errors).toEqual(expect.arrayContaining(['sku_invalid', 'amazon_url_invalid']));
  });
  it('builds five dry-run Amazon campaign structures', () => {
    expect(buildAmazonPlan(product, costs).campaigns.map(c => c.type)).toEqual(['auto', 'manual_exact', 'manual_phrase', 'manual_broad', 'product_targeting']);
  });
  it('uses OutboundClick and never Purchase for Meta to Amazon', () => {
    const plan = buildMetaPlan(product, { business_manager_id: 'bm_fbrsigns', ad_account_id: 'act_123', destination_url: 'https://www.amazon.com/dp/B012345678' });
    expect(plan.event).toBe('OutboundClick');
    expect(JSON.stringify(plan)).not.toContain('Purchase');
  });
  it('makes attribution pending non-blocking and creates five Kanban previews', () => {
    expect(buildTrackingPlan(product, { destination_url: 'https://www.amazon.com/dp/B012345678' }).attribution_status).toBe('pending');
    expect(buildKanbanCards('FBR-ROLLUP-001').map(c => c.title)).toHaveLength(5);
  });
});
