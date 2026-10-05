import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { hasCapability, getAuthContext } from '../lib/auth';
import { middleware } from '../middleware';

afterEach(() => vi.unstubAllEnvs());
describe('authorization and browser mutation boundaries', () => {
  it('requires an explicit trusted role for review and publication', () => {
    const auth = { userId:'A',organizationId:'A',mode:'supabase-session' as const };
    expect(hasCapability(auth,'publish')).toBe(false);
    expect(hasCapability({...auth,roles:['operator']},'review')).toBe(false);
    expect(hasCapability({...auth,roles:['reviewer']},'review')).toBe(true);
    expect(hasCapability({...auth,roles:['reviewer']},'publish')).toBe(false);
    expect(hasCapability({...auth,roles:['admin']},'publish')).toBe(true);
  });
  it('rejects cross-origin login and oversized requests before handlers', () => {
    expect(middleware(new NextRequest('https://fbr.example/api/auth/session',{method:'POST',headers:{origin:'https://evil.example'}})).status).toBe(403);
    expect(middleware(new NextRequest('https://fbr.example/api/auth/session',{method:'POST',headers:{'content-length':'7000000'}})).status).toBe(413);
  });
  it('cannot enable development identity in production', () => {
    vi.stubEnv('NODE_ENV','production'); vi.stubEnv('PRELISTING_AUTH_MODE','local-only'); vi.stubEnv('PRELISTING_ALLOW_LOCAL_ONLY','true');
    expect(getAuthContext(new NextRequest('https://fbr.example'))).toBeNull();
  });
});
