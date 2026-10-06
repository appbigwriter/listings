export const REQUIRED_COST_FIELDS = ['product_cost','printing_cost','packaging_cost','shipping_cost','amazon_referral_fee','fulfillment_fee','other_costs'] as const;
import {isNumericInput} from '../catalog/numeric-input';
export type CostField = typeof REQUIRED_COST_FIELDS[number];
export type MarketingCosts = Record<CostField, number | string | undefined> & { currency?: string; calculated_at?: string };
export type Margin = { revenue: number; total_cost: number; profit: number; percentage: number; currency: string; calculated_at: string };

export function calculateMargin(price: number | string, costs: MarketingCosts): Margin {
  if(!costs||typeof costs!=='object'||Array.isArray(costs))throw new Error('costs_required');
  if(costs.currency!=='USD')throw new Error('cost_currency_must_be_USD');
  const revenue = Number(price);
  if (!isNumericInput(price) || revenue <= 0) throw new Error('price_required');
  for (const field of REQUIRED_COST_FIELDS) {
    const value = costs[field];
    if (!isNumericInput(value) || Number(value) < 0) throw new Error(`${field}_required`);
  }
  const total_cost = REQUIRED_COST_FIELDS.reduce((sum, field) => sum + Number(costs[field]), 0);
  if(!Number.isFinite(total_cost)||!Number.isSafeInteger(Math.round(total_cost*100))||!Number.isSafeInteger(Math.round(revenue*100)))throw new Error('cost_or_revenue_out_of_range');
  const profit = revenue - total_cost;
  return { revenue, total_cost: round(total_cost), profit: round(profit), percentage: round(profit / revenue * 100), currency: costs.currency, calculated_at: costs.calculated_at || new Date().toISOString() };
}
function round(value: number) { return Math.round((value + Number.EPSILON) * 100) / 100; }
