import { createHmac, timingSafeEqual } from 'node:crypto';
import { NextRequest } from 'next/server';

export type UserRole = 'operator' | 'reviewer' | 'admin';
export type AuthContext = { userId: string; organizationId: string; roles?: UserRole[]; mode: 'local-only' | 'trusted-gateway' | 'supabase-session' };
export function hasCapability(auth: AuthContext, capability: 'review' | 'publish' | 'admin') {
  const roles = auth.roles || [];
  return roles.includes('admin') || capability === 'review' && roles.includes('reviewer');
}

export function getAuthContext(req: NextRequest): AuthContext | null {
  const mode = process.env.PRELISTING_AUTH_MODE;
  if (mode === 'local-only') {
    if (process.env.NODE_ENV === 'production' || process.env.PRELISTING_ALLOW_LOCAL_ONLY !== 'true') return null;
    const userId = process.env.PRELISTING_LOCAL_USER_ID?.trim();
    const organizationId = process.env.PRELISTING_LOCAL_ORG_ID?.trim();
    if (!userId || !organizationId) return null;
    return { userId, organizationId, mode, roles: ['admin'] };
  }
  if (mode !== 'trusted-gateway') return null;
  const userId = req.headers.get('x-authenticated-user-id')?.trim();
  const organizationId = req.headers.get('x-authenticated-organization-id')?.trim();
  const signature = req.headers.get('x-authenticated-signature')?.trim();
  const secret = process.env.AUTH_GATEWAY_SECRET;
  if (!userId || !organizationId || !signature || !secret || !/^[0-9a-f]{64}$/i.test(signature)) return null;
  const expected = createHmac('sha256', secret).update(`${userId}:${organizationId}`).digest('hex');
  return timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex')) ? { userId, organizationId, mode, roles: ['operator'] } : null;
}

export function unauthorized() { return { error: 'Autenticação obrigatória. Use uma sessão verificável.', code: 'AUTH_REQUIRED' }; }
export async function resolveAuthContext(req: NextRequest): Promise<AuthContext | null> {
  const gateway = getAuthContext(req); if (gateway) return gateway;
  const token = req.cookies?.get('fbr_access_token')?.value;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!token || !url || !key) return null;
  const { createClient } = await import('@supabase/supabase-js');
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return null;
  const organizationId = data.user.app_metadata.organization_id || data.user.id;
  if (typeof organizationId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(organizationId)) return null;
  const session = await client.rpc('prelisting_session_active');
  if (session.error || session.data !== true) return null;
  const claimedRoles = data.user.app_metadata.prelisting_roles;
  const roles = Array.isArray(claimedRoles) ? claimedRoles.filter((role): role is UserRole => ['operator','reviewer','admin'].includes(role)) : ['operator'] as UserRole[];
  return { userId: data.user.id, organizationId, roles, mode: 'supabase-session' };
}
export function scope<T extends { eq: (column: string, value: string) => T }>(query: T, auth: AuthContext): T {
  return query.eq('organization_id', auth.organizationId).eq('owner_id', auth.userId);
}
