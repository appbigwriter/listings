import { NextRequest, NextResponse } from 'next/server';
import { resolveAuthContext, unauthorized } from '../../../../lib/auth';
import { getSupabase } from '../../../../lib/marketing/supabase';
import { scopeQuery } from '../../../../lib/catalog/repository';

export async function GET(req: NextRequest) {
  const auth = await resolveAuthContext(req); if (!auth) return NextResponse.json(unauthorized(), { status: 401 });
  const db = getSupabase(); if (!db) return NextResponse.json({ error: 'Supabase não configurado.' }, { status: 503 });
  const skus: string[] = [];
  for (let offset = 0; offset <= 5000; offset += 500) { let query = scopeQuery(db.from('prelistings').select('sku'), auth).neq('status', 'archived').order('sku'); const search = req.nextUrl.searchParams.get('search'); if (search) query = query.ilike('title', `%${search.replace(/[%_]/g, '')}%`); const result = await query.range(offset, offset === 5000 ? offset : offset + 499); if (result.error) return NextResponse.json({ error: 'Falha ao selecionar produtos.' }, { status: 503 }); if(offset===5000&&result.data.length)break; skus.push(...result.data.map((row: { sku: string }) => row.sku)); if (result.data.length < 500) return NextResponse.json({ skus }); }
  return NextResponse.json({ error: 'Seleção acima de 5.000 SKUs. Reduza o filtro.' }, { status: 413 });
}
