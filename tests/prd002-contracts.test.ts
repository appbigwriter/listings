import { describe, expect, it } from 'vitest';
import { getAuthContext } from '../lib/auth';
import { buildMarketingPackage, buildKanbanResponse } from '../lib/marketing/contracts';
import { buildE2EFixture } from '../lib/e2e/fixture';

function request(headers: Record<string, string> = {}) {
  return new Request('http://localhost/api/test', { headers }) as any;
}

describe('PRD-002 security and handoff contracts', () => {
  it('does not trust arbitrary identity headers when no provider is configured', () => {
    const previous = process.env.PRELISTING_AUTH_MODE;
    delete process.env.PRELISTING_AUTH_MODE;
    delete process.env.PRELISTING_LOCAL_USER_ID;
    expect(getAuthContext(request({ 'x-user-id': 'attacker' }))).toBeNull();
    if (previous) process.env.PRELISTING_AUTH_MODE = previous;
  });

  it('uses a fixed explicit local-only identity instead of a request identity', () => {
    const previousMode = process.env.PRELISTING_AUTH_MODE;
    const previousUser = process.env.PRELISTING_LOCAL_USER_ID;
    process.env.PRELISTING_AUTH_MODE = 'local-only';
    process.env.PRELISTING_ALLOW_LOCAL_ONLY = 'true';
    process.env.PRELISTING_LOCAL_USER_ID = 'fixture-user';
    process.env.PRELISTING_LOCAL_ORG_ID = 'fixture-org';
    expect(getAuthContext(request({ 'x-user-id': 'attacker' }))).toMatchObject({ userId: 'fixture-user', organizationId: 'fixture-org', mode: 'local-only' });
    if (previousMode) process.env.PRELISTING_AUTH_MODE = previousMode; else delete process.env.PRELISTING_AUTH_MODE;
    if (previousUser) process.env.PRELISTING_LOCAL_USER_ID = previousUser; else delete process.env.PRELISTING_LOCAL_USER_ID;
  });

  it('builds an isolated package with product, economics, channels and tracking', () => {
    const pack = buildMarketingPackage({ sku: 'FBR-A-001', title: 'A' }, { margin: { percentage: 10 } }, { amazon: { sku: 'FBR-A-001' }, meta: null }, { sku: 'FBR-A-001', event: 'OutboundClick' }, { ready: false, blockers: ['real_margin_required'] });
    expect(pack).toMatchObject({ sku: 'FBR-A-001', product: { sku: 'FBR-A-001' }, economics: { margin: { percentage: 10 } }, channels: { amazon: { sku: 'FBR-A-001' } }, tracking: { event: 'OutboundClick' } });
    expect(JSON.stringify(pack)).not.toContain('FBR-B-001');
  });

  it('returns five previews for dry-run and never creates them without confirmation', () => {
    const result = buildKanbanResponse('FBR-A-001', false);
    expect(result).toMatchObject({ created: false, mode: 'dry-run' });
    expect(result.cards).toHaveLength(5);
  });

  it('creates sanitized deterministic E2E fixtures with two isolated SKUs', () => {
    const fixture = buildE2EFixture('run-001');
    expect(fixture).toMatchObject({ run_id: 'run-001', user_id: 'e2e-user', skus: ['FBR-E2E-run-001-A', 'FBR-E2E-run-001-B'] });
    expect(JSON.stringify(fixture)).not.toMatch(/secret|token|password|service_role/i);
  });
});
