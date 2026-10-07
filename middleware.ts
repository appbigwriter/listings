import { NextRequest, NextResponse } from 'next/server';

const publicApi = ['/api/generate', '/api/generate-field'];

function isLoopback(url: string) {
  try { return ['localhost', '127.0.0.1', '::1'].includes(new URL(url).hostname); } catch { return false; }
}

export function middleware(req: NextRequest) {
  if (!req.nextUrl.pathname.startsWith('/api/')) return NextResponse.next();
  if (req.nextUrl.pathname==='/api/health' && req.method==='GET') return NextResponse.next();
  if (!['GET','HEAD','OPTIONS'].includes(req.method)) {
    const origin = req.headers.get('origin');
    const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
    const proto = req.headers.get('x-forwarded-proto') || req.nextUrl.protocol.replace(':', '');
    const headerOrigin = host ? `${proto}://${host}` : undefined;
    const isSame = !origin || origin === req.nextUrl.origin || origin === headerOrigin || (
      process.env.NODE_ENV !== 'production' && isLoopback(origin) && (isLoopback(req.nextUrl.origin) || (headerOrigin ? isLoopback(headerOrigin) : false))
    );
    if (req.headers.get('sec-fetch-site') === 'cross-site' || !isSame) return NextResponse.json({ error: 'Origem da requisição não autorizada.' }, { status: 403 });
    if (Number(req.headers.get('content-length')) > 6_000_000) return NextResponse.json({ error: 'Requisição acima do limite.' }, { status: 413 });
  }
  if (req.nextUrl.pathname.startsWith('/api/auth/')) return NextResponse.next();
  if (req.cookies.get('fbr_access_token')) return NextResponse.next();
  if (publicApi.some(path => req.nextUrl.pathname === path)) return NextResponse.next();
  // local-only is an explicit development mode; route handlers still resolve the fixed identity.
  if (process.env.PRELISTING_AUTH_MODE === 'local-only' && process.env.NODE_ENV !== 'production' && process.env.PRELISTING_ALLOW_LOCAL_ONLY === 'true' && process.env.PRELISTING_LOCAL_USER_ID && process.env.PRELISTING_LOCAL_ORG_ID) return NextResponse.next();
  // A gateway must provide all verified headers; the route adapter performs the HMAC check.
  if (process.env.PRELISTING_AUTH_MODE === 'trusted-gateway' && req.headers.get('x-authenticated-user-id') && req.headers.get('x-authenticated-signature')) return NextResponse.next();
  return NextResponse.json({ error: 'Autenticação obrigatória. Use uma sessão verificável.', code: 'AUTH_REQUIRED' }, { status: 401 });
}

export const config = { matcher: '/api/:path*' };
