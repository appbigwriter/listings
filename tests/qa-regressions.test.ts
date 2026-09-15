import { describe, expect, it } from 'vitest';
import { getAuthContext } from '../lib/auth';
import { buildApprovalRecord, getLatestApprovalDecision, validateApprovalInput } from '../lib/marketing/approval';
import { isSafeRemoteUrlSync, readResponseWithLimit } from '../lib/extract-security';
import { buildIdempotencyKey } from '../lib/marketing/plans';
import { getActiveListing } from '../lib/catalog/active-listing';
import { readFileSync } from 'node:fs';
import { validateAiListingResponse, validateAiFieldResponse } from '../lib/ai/contracts';
import { middleware } from '../middleware';
import { POST as extractPost } from '../app/api/extract/route';

const req = (headers: Record<string, string> = {}) => new Request('http://localhost/api/test', { headers }) as any;

describe('QA security regressions', () => {
  it('rejects local-only in production and accepts only fixed local identity in development', () => {
    const old = { ...process.env };
    process.env.PRELISTING_AUTH_MODE = 'local-only';
    process.env.PRELISTING_ALLOW_LOCAL_ONLY = 'false';
    process.env.PRELISTING_LOCAL_USER_ID = 'fixed-user';
    process.env.PRELISTING_LOCAL_ORG_ID = 'fixed-org';
    expect(getAuthContext(req({ 'x-user-id': 'attacker' }))).toBeNull();
    process.env.PRELISTING_ALLOW_LOCAL_ONLY = 'true';
    expect(getAuthContext(req({ 'x-user-id': 'attacker' }))).toMatchObject({ userId: 'fixed-user' });
    process.env = old;
  });
  it('derives approval actor from authenticated identity, never client approver', () => {
    expect(validateApprovalInput({ sku: 'FBR-A-1', decision: 'approved', comments: 'ok' })).not.toContain('approver_required');
    expect(buildApprovalRecord({ sku: 'FBR-A-1', decision: 'approved', comments: 'ok' }, { userId: 'auth-user', organizationId: 'org', mode: 'local-only' }).approver).toBe('auth-user');
  });
  it('blocks loopback, private and metadata URLs, including hexadecimal mapped IPv6', () => {
    for (const url of ['http://127.0.0.1/a', 'http://10.0.0.1/a', 'http://169.254.169.254/latest', 'http://[::1]/a', 'http://[::ffff:127.0.0.1]/a', 'http://[::ffff:169.254.169.254]/a', 'http://[::ffff:7f00:1]/a', 'http://[0:0:0:0:0:ffff:a9fe:a9fe]/a']) expect(isSafeRemoteUrlSync(url)).toBe(false);
    expect(isSafeRemoteUrlSync('https://example.com/product')).toBe(true);
  });
  it('fails closed for extractor requests and keeps the browser session on the UI call', async () => {
    const previous = { ...process.env };
    delete process.env.PRELISTING_AUTH_MODE;
    const response = middleware(new (require('next/server').NextRequest)('http://localhost/api/extract'));
    expect(response.status).toBe(401);
    const routeResponse = await extractPost(new (require('next/server').NextRequest)('http://localhost/api/extract', { method: 'POST', body: JSON.stringify({ url: 'https://example.com' }) }));
    expect(routeResponse.status).toBe(401);
    expect(readFileSync('middleware.ts', 'utf8')).not.toMatch(/publicApi[\s\S]*\/api\/extract/);
    expect(readFileSync('app/page.tsx', 'utf8')).toMatch(/fetch\('\/api\/extract',[\s\S]*credentials:\s*['"]include['"]/);
    process.env = previous;
  });

  it('aborts a response while its body is still slow', async () => {
    const controller = new AbortController();
    const response = new Response(new ReadableStream({ async start(c) { c.enqueue(new TextEncoder().encode('first')); await new Promise((resolve) => setTimeout(resolve, 40)); c.enqueue(new TextEncoder().encode('second')); c.close(); } }));
    setTimeout(() => controller.abort(), 10);
    await expect(readResponseWithLimit(response, 100, controller.signal)).rejects.toThrow();
  });
  it('reads remote response in bounded chunks', async () => {
    const response = new Response(new ReadableStream({ start(c) { c.enqueue(new Uint8Array(5)); c.enqueue(new Uint8Array(5)); c.close(); } }));
    await expect(readResponseWithLimit(response, 6)).rejects.toThrow('limite');
  });
  it('rejects archived listings through the active-listing repository without mutation', async () => {
    const calls: string[] = [];
    const db = { from: () => ({ select: () => ({ eq() { return this; }, neq(column: string, value: string) { calls.push(`${column}!=${value}`); return this; }, maybeSingle: async () => ({ data: null, error: null }) }) }) };
    const result = await getActiveListing(db as never, { userId: 'u', organizationId: 'o', mode: 'local-only' }, 'SKU');
    expect(result.listing).toBeNull();
    expect(result.archived).toBe(false);
    expect(calls).toContain('status!=archived');
  });
  it('uses the newest decision, not the newest approved decision, for Kanban', () => {
    const kanban = readFileSync('app/api/kanban/route.ts', 'utf8');
    expect(kanban).toMatch(/select\(['"]id,decision,created_at['"]\)/);
    expect(kanban).not.toMatch(/eq\(['"]decision['"],['"]approved['"]\)/);
    expect(kanban).toMatch(/approval_required|APPROVAL_NOT_CURRENT/);
    for (const file of ['app/api/generate/route.ts', 'app/api/generate-field/route.ts']) expect(readFileSync(file, 'utf8')).toMatch(/getAuthContext|AUTH_REQUIRED/);
  });
  it('invalidates an old approval when a newer rejection exists and keeps the newest of multiple approvals', () => {
    expect(getLatestApprovalDecision([
      { decision: 'approved', created_at: '2026-01-02T00:00:00.000Z' },
      { decision: 'rejected', created_at: '2026-01-03T00:00:00.000Z' },
    ])).toBe('rejected');
    expect(getLatestApprovalDecision([
      { decision: 'approved', created_at: '2026-01-01T00:00:00.000Z' },
      { decision: 'approved', created_at: '2026-01-04T00:00:00.000Z' },
    ])).toBe('approved');
  });
  it('protects every dependent GET with the active owner-scoped listing helper', () => {
    for (const file of ['app/api/seller-submission/route.ts', 'app/api/marketing-approvals/route.ts', 'app/api/amazon-campaigns/route.ts', 'app/api/meta-campaigns/route.ts', 'app/api/tracking-plans/route.ts', 'app/api/marketing-profiles/route.ts', 'app/api/seller-handoff/route.ts']) {
      expect(readFileSync(file, 'utf8')).toMatch(/getActiveListing|getActiveListingSkus/);
    }
  });
  it('has deterministic idempotency key for Kanban confirmation', () => {
    expect(buildIdempotencyKey('FBR-A-1', 'org')).toBe(buildIdempotencyKey('FBR-A-1', 'org'));
    expect(buildIdempotencyKey('FBR-A-1', 'org')).not.toBe(buildIdempotencyKey('FBR-A-1', 'other'));
  });
  it('migration makes tenant columns non-null for new writes and protects all marketing tables', () => {
    const sql = readFileSync('supabase-closing-migration.sql', 'utf8');
    expect(sql).toMatch(/alter column owner_id set not null/);
    expect(sql).toMatch(/alter column organization_id set not null/);
    expect(sql).toMatch(/marketing_approvals[\s\S]*owner_access/);
    expect(sql).toMatch(/owner_id = auth\.uid\(\)\s+AND\s+organization_id/);
    expect(sql).not.toMatch(/owner_id = auth\.uid\(\)[\s\S]{0,120}OR\s+organization_id/);
    expect(sql).toMatch(/archived/);
    expect(sql).toMatch(/drop constraint if exists prelistings_sku_key/i);
    expect(sql).toMatch(/drop policy if exists prelistings_tenant_access/i);
    expect(sql).toMatch(/_tenant_access/);
  });
  it('checks every altered table for null tenant identities before enforcing NOT NULL', () => {
    const sql = readFileSync('supabase-closing-migration.sql', 'utf8');
    for (const table of ['prelistings', 'product_marketing_profiles', 'amazon_campaign_plans', 'meta_campaign_plans', 'tracking_plans', 'marketing_tasks', 'marketing_approvals']) {
      expect(sql).toContain(table);
    }
    expect(sql).toContain('FOREACH t IN ARRAY');
    expect(sql).toContain("'prelistings'");
    expect(sql).toMatch(/backfill owner_id and organization_id/i);
    expect(sql).toMatch(/raise exception/i);
  });
  it('preflights every required table before the first ALTER TABLE', () => {
    const sql = readFileSync('supabase-closing-migration.sql', 'utf8');
    const firstAlterMatch = /(?:^|\n)\s*alter table\b/i.exec(sql);
    const firstAlter = firstAlterMatch?.index ?? -1;

    const preflight = sql.toLowerCase().indexOf('safe_migration_aborted');
    expect(firstAlter).toBeGreaterThan(-1);
    expect(preflight).toBeGreaterThan(-1);
    expect(preflight).toBeLessThan(firstAlter);
    const beforeAlter = sql.slice(0, firstAlter);
    for (const table of ['prelistings', 'product_marketing_profiles', 'amazon_campaign_plans', 'meta_campaign_plans', 'tracking_plans', 'marketing_tasks', 'marketing_approvals']) {
      expect(beforeAlter).toContain(`'${table}'`);
    }
    expect(sql.toLowerCase().indexOf('set not null')).toBeGreaterThan(sql.toLowerCase().indexOf('where owner_id is null'));
  });

  it('scopes every listing operation by authenticated owner and organization', () => {
    const source = readFileSync('app/api/listings/route.ts', 'utf8');
    expect((source.match(/owner_id/g) || []).length).toBeGreaterThanOrEqual(4);
    expect(source.includes(".eq('organization_id',auth.organizationId).eq('owner_id',auth.userId)")).toBe(true);
  });
  it('accepts only explicitly supplied FBR facts and marks draft review', () => {
    const input = { fbrFacts: { title: 'Known sign' }, referenceData: { title: 'Competitor sign', review: '5 stars' } };
    const result = validateAiListingResponse({ title: 'Known sign', price: '99.99', invented: 'x' }, input);
    expect(result.ok).toBe(false);
    const safe = validateAiListingResponse({ title: 'Known sign', description: '' }, input);
    expect(safe).toMatchObject({ ok: true, value: { title: 'Known sign', status: 'draft', review_required: true } });
  });
  it('rejects competitor brand, review and claim when absent from FBR facts', () => {
    const input = { fbrFacts: { title: 'FBR sign' }, fieldId: 'title', referenceData: { brand: 'RivalBrand', review: 'best sign', claim: 'weatherproof forever' } };
    for (const value of ['RivalBrand', 'best sign', 'weatherproof forever']) {
      expect(validateAiFieldResponse('title', value, input)).toMatchObject({ ok: false });
    }
    expect(validateAiFieldResponse('title', 'FBR sign', input)).toMatchObject({ ok: true, value: 'FBR sign' });
  });
});
