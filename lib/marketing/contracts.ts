export type MarketingPackage = {
  version: '2026-01'; sku: string; exported_at: string; product: unknown; economics: unknown;
  channels: { amazon: unknown; meta: unknown }; tracking: unknown; approval: unknown; gate: unknown;
};

export function buildMarketingPackage(product: { sku: string; [key: string]: unknown }, economics: unknown, channels: { amazon: unknown; meta: unknown }, tracking: unknown, gate: unknown, approval: unknown = null): MarketingPackage {
  return { version: '2026-01', sku: product.sku, exported_at: new Date().toISOString(), product, economics, channels, tracking, approval, gate };
}

export function marketingPackageMarkdown(pack: MarketingPackage): string {
  const economics = pack.economics as { margin?: { percentage?: number; profit?: number } } | null;
  const tracking = pack.tracking as { event?: string; attribution_status?: string } | null;
  const gate = pack.gate as { ready?: boolean; blockers?: string[] } | null;
  return [`# Marketing Readiness · ${pack.sku}`, '', `- Package version: ${pack.version}`, `- Readiness: ${gate?.ready ? 'ready' : 'blocked'}`, `- Blockers: ${gate?.blockers?.join(', ') || 'none'}`, `- Margin: ${economics?.margin?.percentage ?? 'not calculated'}%`, `- Profit: ${economics?.margin?.profit ?? 'not calculated'}`, `- Tracking event: ${tracking?.event || 'not configured'}`, `- Attribution: ${tracking?.attribution_status || 'pending'}`, '', '## Product', '```json', JSON.stringify(pack.product, null, 2), '```', '', '## Economics', '```json', JSON.stringify(pack.economics, null, 2), '```', '', '## Channels', '```json', JSON.stringify(pack.channels, null, 2), '```', '', '## Tracking', '```json', JSON.stringify(pack.tracking, null, 2), '```'].join('\n');
}

export function buildKanbanResponse(sku: string, confirm: boolean) {
  const cards = ['Amazon PPC plan', 'Meta Ads plan', 'Tracking plan', 'Creative brief', 'Launch gate review'].map((title, index) => ({ client_key: `${sku}:${index + 1}`, sku, title, status: confirm ? 'pending' : 'preview', mode: confirm ? 'create' : 'dry-run' }));
  return { mode: confirm ? 'create' as const : 'dry-run' as const, created: false, cards, warning: confirm ? undefined : 'Preview only. Send confirm=true after explicit approval.' };
}
