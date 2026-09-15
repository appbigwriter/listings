export type E2EFixture = { run_id: string; user_id: string; organization_id: string; skus: [string, string]; listings: Array<{ sku: string; title: string; status: 'draft'; human_reviewed: boolean }> };

export function buildE2EFixture(runId: string): E2EFixture {
  const safe = runId.replace(/[^a-zA-Z0-9-]/g, '-');
  const skus = [`FBR-E2E-${safe}-A`, `FBR-E2E-${safe}-B`] as [string, string];
  return { run_id: safe, user_id: 'e2e-user', organization_id: 'e2e-org', skus, listings: skus.map((sku, index) => ({ sku, title: `Sanitized fixture ${index + 1}`, status: 'draft', human_reviewed: false })) };
}
