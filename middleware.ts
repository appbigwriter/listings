import { NextRequest, NextResponse } from 'next/server';

const publicApi = ['/api/generate', '/api/generate-field'];

export function middleware(req: NextRequest) {
  if (!req.nextUrl.pathname.startsWith('/api/')) return NextResponse.next();
  if (publicApi.some(path => req.nextUrl.pathname === path)) return NextResponse.next();
  // local-only is an explicit development mode; route handlers still resolve the fixed identity.
  if (process.env.PRELISTING_AUTH_MODE === 'local-only' && process.env.NODE_ENV !== 'production' && process.env.PRELISTING_ALLOW_LOCAL_ONLY === 'true' && process.env.PRELISTING_LOCAL_USER_ID && process.env.PRELISTING_LOCAL_ORG_ID) return NextResponse.next();
  // A gateway must provide all verified headers; the route adapter performs the HMAC check.
  if (process.env.PRELISTING_AUTH_MODE === 'trusted-gateway' && req.headers.get('x-authenticated-user-id') && req.headers.get('x-authenticated-signature')) return NextResponse.next();
  return NextResponse.json({ error: 'Autenticação obrigatória. Use uma sessão verificável.', code: 'AUTH_REQUIRED' }, { status: 401 });
}

export const config = { matcher: '/api/:path*' };
