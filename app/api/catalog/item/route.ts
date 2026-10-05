import { NextRequest, NextResponse } from 'next/server';
import { resolveAuthContext, unauthorized } from '../../../../lib/auth';
import { getSupabase } from '../../../../lib/marketing/supabase';
import { CatalogError, loadProduct } from '../../../../lib/catalog/repository';
import { contentHash, isChannel } from '../../../../lib/catalog/model';
import { evaluateReadiness } from '../../../../lib/catalog/readiness';
import { amazonAttributes } from '../../../../lib/marketplaces/amazon';

export async function GET(req: NextRequest) {
  const auth = await resolveAuthContext(req); if (!auth) return NextResponse.json(unauthorized(), { status: 401 });
  const db = getSupabase(); if (!db) return NextResponse.json({ error: 'Supabase não configurado.' }, { status: 503 });
  try { const rawChannel = req.nextUrl.searchParams.get('channel'); const channel = isChannel(rawChannel) ? rawChannel : 'amazon-us'; const loaded = await loadProduct(db, auth, req.nextUrl.searchParams.get('sku') || ''); return NextResponse.json({ product: loaded.product, updated_at: loaded.row.updated_at, content_hash: contentHash(loaded.product, channel), report: evaluateReadiness(loaded.product, channel), effective_attributes: channel === 'amazon-us' ? amazonAttributes(loaded.product) : loaded.product._catalog?.channels[channel]?.attributes || {} }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Falha ao carregar.' }, { status: error instanceof CatalogError ? error.status : 500 }); }
}
