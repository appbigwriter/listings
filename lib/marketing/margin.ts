export const REQUIRED_COST_FIELDS = ['product_cost','printing_cost','packaging_cost','shipping_cost','amazon_referral_fee','fulfillment_fee','other_costs'] as const;
export type CostField = typeof REQUIRED_COST_FIELDS[number];
export type MarketingCosts = Record<CostField, number | string | undefined> & { currency?: string; calculated_at?: string };
export type Margin = { revenue: number; total_cost: number; profit: number; percentage: number; currency: string; calculated_at: string };

export function calculateMargin(price: number | string, costs: MarketingCosts): Margin {
  const revenue = Number(price);
  if (!Number.isFinite(revenue) || revenue <= 0) throw new Error('price_required');
  for (const field of REQUIRED_COST_FIELDS) {
    const value = costs[field];
    if (value === undefined || value === null || value === '' || !Number.isFinite(Number(value)) || Number(value) < 0) throw new Error(`${field}_required`);
  }
  const total_cost = REQUIRED_COST_FIELDS.reduce((sum, field) => sum + Number(costs[field]), 0);
  const profit = revenue - total_cost;
  return { revenue, total_cost: round(total_cost), profit: round(profit), percentage: round(profit / revenue * 100), currency: costs.currency || 'USD', calculated_at: costs.calculated_at || new Date().toISOString() };
}
function round(value: number) { return Math.round((value + Number.EPSILON) * 100) / 100; }
