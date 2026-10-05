import { readJsonBody, RequestBodyError } from '../../../../lib/http';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { resolveAuthContext } from '../../../../lib/auth';
import { getSupabase } from '../../../../lib/marketing/supabase';

function client() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) throw new Error('Autenticação Supabase não configurada.');
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}
function sessionResponse(session: { access_token: string; refresh_token: string; expires_in: number }) {
  const response = NextResponse.json({ authenticated: true });
  const cookie = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict' as const, path: '/' };
  response.cookies.set('fbr_access_token', session.access_token, { ...cookie, maxAge: session.expires_in });
  response.cookies.set('fbr_refresh_token', session.refresh_token, { ...cookie, maxAge: 30 * 86400 });
  return response;
}
export async function GET(req: NextRequest) {
  const auth = await resolveAuthContext(req);
  if (auth) return NextResponse.json({ authenticated: true, organization: auth.organizationId, roles: auth.roles });
  const refreshToken = req.cookies.get('fbr_refresh_token')?.value;
  if (refreshToken) { try { const result = await client().auth.refreshSession({ refresh_token: refreshToken }); if (!result.error && result.data.session) return sessionResponse(result.data.session); } catch {} }
  return NextResponse.json({ authenticated: false }, { status: 401 });
}
export async function POST(req: NextRequest) {
  try {
    const body = await readJsonBody(req, 4096);
    if (typeof body.email !== 'string' || typeof body.password !== 'string' || body.email.length > 254 || body.password.length > 1024) return NextResponse.json({ error: 'Credenciais inválidas.' }, { status: 400 });
    const result = await client().auth.signInWithPassword({ email: body.email, password: body.password });
    if (result.error || !result.data.session) return NextResponse.json({ error: 'Não foi possível entrar. Confira suas credenciais.' }, { status: 401 });
    return sessionResponse(result.data.session);
  } catch (error) { return NextResponse.json({ error: error instanceof RequestBodyError ? error.message : 'Não foi possível autenticar.' }, { status: error instanceof RequestBodyError ? error.status : 503 }); }
}
export async function DELETE(req: NextRequest) {
  const token = req.cookies.get('fbr_access_token')?.value;
  if (token) {
    const db = getSupabase();
    if (!db) return NextResponse.json({ error: 'Não foi possível revogar a sessão.' }, { status: 503 });
    const revoked = await db.auth.admin.signOut(token, 'local');
    if (revoked.error && ![401,403,404].includes(revoked.error.status || 0)) return NextResponse.json({ error: 'Não foi possível revogar a sessão. Tente novamente.' }, { status: 503 });
  }
  const response = NextResponse.json({ authenticated: false });
  response.cookies.delete('fbr_access_token'); response.cookies.delete('fbr_refresh_token'); return response;
}
