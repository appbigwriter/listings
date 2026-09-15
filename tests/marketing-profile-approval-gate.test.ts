import { describe, expect, it } from 'vitest';
import { getMarketingProfileContext, validateLaunchReadyTransition } from '../lib/marketing/profile-guard';

const auth = { userId: 'owner-1', organizationId: 'org-1', mode: 'local-only' } as const;
const readyGate = { ready: true, blockers: [], checked_at: '2026-09-15T00:00:00.000Z' };

function queryResult(data: unknown, calls: string[]) {
  const query = {
    select() { return this; },
    eq(column: string, value: unknown) { calls.push(`${column}=${String(value)}`); return this; },
    neq() { return this; },
    order() { return this; },
    limit() { return this; },
    maybeSingle: async () => ({ data, error: null }),
  };
  return query;
}

describe('marketing profile launch approval guard', () => {
  it('invalidates an old approval when the newest decision is rejected', () => {
    expect(validateLaunchReadyTransition(readyGate, { decision: 'rejected' })).toEqual({
      ok: false,
      code: 'APPROVAL_NOT_CURRENT',
    });
  });

  it('requires an approval when no decision exists', () => {
    expect(validateLaunchReadyTransition(readyGate, null)).toEqual({
      ok: false,
      code: 'APPROVAL_REQUIRED',
    });
  });

  it('rejects launch_ready when the listing is missing, but keeps normal statuses allowed', () => {
    expect(validateLaunchReadyTransition({ ready: false, blockers: ['stock_required'] }, { decision: 'approved' })).toMatchObject({
      ok: false,
      code: 'LAUNCH_GATE_BLOCKED',
    });
    expect(validateLaunchReadyTransition(readyGate, { decision: 'approved' })).toEqual({ ok: true });
  });

  it('centralizes active listing and newest owner/org-scoped approval lookup', async () => {
    const calls: string[] = [];
    const db = {
      from(table: string) {
        calls.push(`from:${table}`);
        if (table === 'prelistings') return queryResult({ id: 'listing-1', sku: 'FBR-A-1', status: 'draft' }, calls);
        if (table === 'product_marketing_profiles') return queryResult({ id: 'profile-1', sku: 'FBR-A-1' }, calls);
        return queryResult({ id: 'approval-2', decision: 'approved', created_at: '2026-09-15T00:00:00.000Z' }, calls);
      },
    };
    const result = await getMarketingProfileContext(db, auth, 'FBR-A-1');
    expect(result.listing).toMatchObject({ id: 'listing-1' });
    expect(result.profile).toMatchObject({ id: 'profile-1' });
    expect(result.latestApproval).toMatchObject({ decision: 'approved' });
    expect(calls).toContain('from:marketing_approvals');
    expect(calls).toContain('owner_id=owner-1');
    expect(calls).toContain('organization_id=org-1');
  });

  it('uses the newest decision from multiple approvals without PGRST116', async () => {
    const calls: string[] = [];
    const approvals = [
      { id: 'approval-old', decision: 'approved', created_at: '2026-09-14T00:00:00.000Z' },
      { id: 'approval-new', decision: 'rejected', created_at: '2026-09-15T00:00:00.000Z' },
    ];
    const db = {
      from(table: string) {
        if (table === 'prelistings') return queryResult({ id: 'listing-1', sku: 'FBR-A-1' }, calls);
        if (table === 'product_marketing_profiles') return queryResult({ id: 'profile-1' }, calls);
        const query = {
          select() { return this; },
          eq(column: string, value: unknown) { calls.push(`${column}=${String(value)}`); return this; },
          order(column: string, options: unknown) { calls.push(`order:${column}:${JSON.stringify(options)}`); return this; },
          limit(count: number) { calls.push(`limit:${count}`); return this; },
          maybeSingle: async () => calls.includes('limit:1')
            ? { data: approvals[1], error: null }
            : { data: null, error: { code: 'PGRST116' } },
        };
        return query;
      },
    };
    const result = await getMarketingProfileContext(db, auth, 'FBR-A-1');
    expect(result.error).toBeNull();
    expect(result.latestApproval).toMatchObject({ id: 'approval-new', decision: 'rejected' });
    expect(calls).toContain('limit:1');
    expect(calls).toContain('order:created_at:{"ascending":false}');
  });

  it('does not treat an orphan profile as a valid marketing context', async () => {
    const db = {
      from(table: string) {
        if (table === 'prelistings') return queryResult(null, []);
        if (table === 'product_marketing_profiles') return queryResult({ id: 'orphan' }, []);
        return queryResult(null, []);
      },
    };
    const result = await getMarketingProfileContext(db, auth, 'FBR-A-1');
    expect(result.listing).toBeNull();
    expect(result.profile).toBeNull();
  });
});
