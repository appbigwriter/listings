import { createHmac, timingSafeEqual } from 'node:crypto';
import { NextRequest } from 'next/server';

export type AuthContext = { userId: string; organizationId: string; mode: 'local-only' | 'trusted-gateway' };

export function getAuthContext(req: NextRequest): AuthContext | null {
  const mode = process.env.PRELISTING_AUTH_MODE;
  if (mode === 'local-only') {
    if (process.env.NODE_ENV === 'production' || process.env.PRELISTING_ALLOW_LOCAL_ONLY !== 'true') return null;
    const userId = process.env.PRELISTING_LOCAL_USER_ID?.trim();
    const organizationId = process.env.PRELISTING_LOCAL_ORG_ID?.trim();
    if (!userId || !organizationId) return null;
    return { userId, organizationId, mode };
  }
  if (mode !== 'trusted-gateway') return null;
  const userId = req.headers.get('x-authenticated-user-id')?.trim();
  const organizationId = req.headers.get('x-authenticated-organization-id')?.trim();
  const signature = req.headers.get('x-authenticated-signature')?.trim();
  const secret = process.env.AUTH_GATEWAY_SECRET;
  if (!userId || !organizationId || !signature || !secret || !/^[0-9a-f]{64}$/i.test(signature)) return null;
  const expected = createHmac('sha256', secret).update(`${userId}:${organizationId}`).digest('hex');
  return timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex')) ? { userId, organizationId, mode } : null;
}

export function unauthorized() { return { error: 'Autenticação obrigatória. Use uma sessão verificável.', code: 'AUTH_REQUIRED' }; }
export function scope<T extends { eq: (column: string, value: string) => T }>(query: T, auth: AuthContext): T {
  return query.eq('organization_id', auth.organizationId).eq('owner_id', auth.userId);
}
