import type { MarketingCosts } from './margin';
export type Product = { sku: string; title?: string; price?: string|number; keywords?: string; asin?: string; [key:string]: unknown };
const now = () => new Date().toISOString();
const keywords = (p: Product) => String(p.keywords || '').split(/[,\n]+/).map(x=>x.trim()).filter(Boolean);
export function buildAmazonPlan(product: Product, costs?: MarketingCosts) {
  const terms = keywords(product); const budget = Math.max(10, Math.round(Number(product.price || 0) * .1));
  const campaigns = [
    ['auto','Discovery and search-term harvesting'], ['manual_exact','Convert proven high-intent terms'], ['manual_phrase','Capture close variants'], ['manual_broad','Discover adjacent demand'], ['product_targeting','Test competing/detail-page placements']
  ].map(([type, objective]) => ({ type, objective, hypothesis: `${type} will identify qualified demand for ${product.sku}`, daily_budget_usd: budget, default_bid_usd: 1, keywords: type === 'product_targeting' ? [] : terms, asins: type === 'product_targeting' && product.asin ? [product.asin] : [], negatives: [] }));
  return { sku: product.sku, status: 'draft', generated_at: now(), source_provenance: { product: 'prelistings', generated_at: now() }, campaigns, note: 'Draft only. No Amazon Ads API call or spend.' };
}
export function buildMetaPlan(product: Product, config: { business_manager_id: string; ad_account_id: string; pixel_id?: string; destination_url: string }) {
  return { sku: product.sku, status: 'draft', generated_at: now(), business_manager_id: config.business_manager_id, ad_account_id: config.ad_account_id, pixel_id: config.pixel_id || 'pending', objective: 'Traffic', destination_url: config.destination_url, event: 'OutboundClick', audiences: ['broad prospecting','engaged shoppers','remarketing when eligible'], creatives: ['product demonstration','benefit-led static','comparison-safe carousel'], daily_budget_usd: 20, utms: { utm_source: 'meta', utm_medium: 'paid_social', utm_campaign: product.sku.toLowerCase(), utm_content: '{{ad.id}}' }, amazon_attribution_status: 'pending', note: 'Draft only. Amazon conversion is not claimed for this destination; no Meta API call.' };
}
export function buildTrackingPlan(product: Product, config: { destination_url: string; attribution_tag?: string }) { return { sku: product.sku, status: 'draft', generated_at: now(), destination_url: config.destination_url, event: 'OutboundClick', attribution_status: config.attribution_tag ? 'available' : 'pending', attribution_tag: config.attribution_tag || null, utm_rules: { source: 'meta', medium: 'paid_social', campaign: product.sku.toLowerCase() }, validation_instructions: ['Open the final URL and confirm Amazon destination', 'Verify outbound click event in browser diagnostics', 'When eligible, add and validate Amazon Attribution tag'] }; }
export function buildKanbanCards(sku: string) { return ['Amazon PPC plan','Meta Ads plan','Tracking plan','Creative brief','Launch gate review'].map(title => ({ sku, title, agent: 'marketing-readiness', status: 'preview', mode: 'dry-run', created_at: now() })); }
