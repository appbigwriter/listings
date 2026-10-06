import { createHmac } from 'node:crypto';
import type { AuthContext, UserRole } from '../../../lib/auth';

export const MOCK_ORGANIZATION_A = '11111111-1111-4111-8111-111111111111';
export const MOCK_USER_OPERATOR_A = '22222222-2222-4222-8222-222222222222';
export const MOCK_USER_REVIEWER_A = '33333333-3333-4333-8333-333333333333';
export const MOCK_USER_ADMIN_A = '44444444-4444-4444-8444-444444444444';

export const MOCK_ORGANIZATION_B = '55555555-5555-4555-8555-555555555555';
export const MOCK_USER_ATTACKER_B = '66666666-6666-4666-8666-666666666666';

export const TEST_GATEWAY_SECRET = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

export function createTestAuthContext(options: {
  userId?: string;
  organizationId?: string;
  roles?: UserRole[];
  mode?: 'local-only' | 'trusted-gateway' | 'supabase-session';
} = {}): AuthContext {
  return {
    userId: options.userId || MOCK_USER_OPERATOR_A,
    organizationId: options.organizationId || MOCK_ORGANIZATION_A,
    roles: options.roles || ['operator'],
    mode: options.mode || 'supabase-session',
  };
}

export function generateGatewayHeaders(userId: string, organizationId: string, secret = TEST_GATEWAY_SECRET) {
  const signature = createHmac('sha256', secret).update(`${userId}:${organizationId}`).digest('hex');
  return {
    'x-authenticated-user-id': userId,
    'x-authenticated-organization-id': organizationId,
    'x-authenticated-signature': signature,
  };
}

export function createMockNextRequest(url: string, init: {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  cookies?: Record<string, string>;
} = {}) {
  const req = new Request(url, {
    method: init.method || 'GET',
    headers: init.headers || {},
    body: init.body,
  }) as any;

  if (init.cookies) {
    req.cookies = {
      get: (name: string) => (init.cookies && init.cookies[name] !== undefined ? { name, value: init.cookies[name] } : undefined),
    };
  } else {
    req.cookies = {
      get: () => undefined,
    };
  }

  req.nextUrl = new URL(url);
  return req;
}
