import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
let savedEnvironment: NodeJS.ProcessEnv;
beforeEach(() => { savedEnvironment = {...process.env}; });
afterEach(() => { vi.unstubAllEnvs(); process.env = savedEnvironment; });
import { getAuthContext, hasCapability, resolveAuthContext, unauthorized } from '../../../lib/auth';
import {
  createMockNextRequest,
  generateGatewayHeaders,
  MOCK_ORGANIZATION_A,
  MOCK_USER_ADMIN_A,
  MOCK_USER_OPERATOR_A,
  MOCK_USER_REVIEWER_A,
  TEST_GATEWAY_SECRET,
} from '../fixtures/auth-fixtures';

describe('AG-01: Auth Journey E2E & Session Lifecycle (S4-04)', () => {
  it('enforces RBAC capabilities correctly across operator, reviewer and admin', () => {
    const operatorAuth = {
      userId: MOCK_USER_OPERATOR_A,
      organizationId: MOCK_ORGANIZATION_A,
      roles: ['operator' as const],
      mode: 'supabase-session' as const,
    };
    const reviewerAuth = {
      userId: MOCK_USER_REVIEWER_A,
      organizationId: MOCK_ORGANIZATION_A,
      roles: ['reviewer' as const],
      mode: 'supabase-session' as const,
    };
    const adminAuth = {
      userId: MOCK_USER_ADMIN_A,
      organizationId: MOCK_ORGANIZATION_A,
      roles: ['admin' as const],
      mode: 'supabase-session' as const,
    };

    // Operator cannot review, publish, or administer
    expect(hasCapability(operatorAuth, 'review')).toBe(false);
    expect(hasCapability(operatorAuth, 'publish')).toBe(false);
    expect(hasCapability(operatorAuth, 'admin')).toBe(false);

    // Reviewer can review, but cannot publish or administer
    expect(hasCapability(reviewerAuth, 'review')).toBe(true);
    expect(hasCapability(reviewerAuth, 'publish')).toBe(false);
    expect(hasCapability(reviewerAuth, 'admin')).toBe(false);

    // Admin has full capabilities (review, publish, admin)
    expect(hasCapability(adminAuth, 'review')).toBe(true);
    expect(hasCapability(adminAuth, 'publish')).toBe(true);
    expect(hasCapability(adminAuth, 'admin')).toBe(true);
  });

  it('validates trusted gateway signature strictly with timing-safe comparison', () => {
    const oldEnv = { ...process.env };
    process.env.PRELISTING_AUTH_MODE = 'trusted-gateway';
    process.env.AUTH_GATEWAY_SECRET = TEST_GATEWAY_SECRET;

    // Valid signature
    const validHeaders = generateGatewayHeaders(MOCK_USER_OPERATOR_A, MOCK_ORGANIZATION_A, TEST_GATEWAY_SECRET);
    const validReq = createMockNextRequest('http://localhost/api/test', { headers: validHeaders });
    const authValid = getAuthContext(validReq);
    expect(authValid).not.toBeNull();
    expect(authValid?.userId).toBe(MOCK_USER_OPERATOR_A);
    expect(authValid?.organizationId).toBe(MOCK_ORGANIZATION_A);
    expect(authValid?.mode).toBe('trusted-gateway');

    // Invalid / forged signature
    const forgedHeaders = {
      'x-authenticated-user-id': MOCK_USER_OPERATOR_A,
      'x-authenticated-organization-id': MOCK_ORGANIZATION_A,
      'x-authenticated-signature': '0000000000000000000000000000000000000000000000000000000000000000',
    };
    const forgedReq = createMockNextRequest('http://localhost/api/test', { headers: forgedHeaders });
    expect(getAuthContext(forgedReq)).toBeNull();

    // Missing signature or headers
    const missingReq = createMockNextRequest('http://localhost/api/test', {
      headers: { 'x-authenticated-user-id': MOCK_USER_OPERATOR_A },
    });
    expect(getAuthContext(missingReq)).toBeNull();

    process.env = oldEnv;
  });

  it('fails closed in production if PRELISTING_AUTH_MODE=local-only', () => {
    const oldEnv = { ...process.env };
    process.env.PRELISTING_AUTH_MODE = 'local-only';
    vi.stubEnv('NODE_ENV', 'production');
    process.env.PRELISTING_ALLOW_LOCAL_ONLY = 'true';
    process.env.PRELISTING_LOCAL_USER_ID = MOCK_USER_ADMIN_A;
    process.env.PRELISTING_LOCAL_ORG_ID = MOCK_ORGANIZATION_A;

    const req = createMockNextRequest('http://localhost/api/test');
    expect(getAuthContext(req)).toBeNull();

    process.env = oldEnv;
  });

  it('provides standardized unauthorized error response contract', () => {
    const err = unauthorized();
    expect(err).toEqual({
      error: 'Autenticação obrigatória. Use uma sessão verificável.',
      code: 'AUTH_REQUIRED',
    });
  });

  it('rejects unauthenticated requests in resolveAuthContext when no session cookie exists', async () => {
    const oldEnv = { ...process.env };
    delete process.env.PRELISTING_AUTH_MODE;
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'mock-anon-key';

    const req = createMockNextRequest('http://localhost/api/test');
    const auth = await resolveAuthContext(req);
    expect(auth).toBeNull();

    process.env = oldEnv;
  });
});
