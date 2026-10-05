import { NextRequest, NextResponse } from 'next/server';
import { resolveAuthContext, unauthorized } from '../../../../lib/auth';
import { getSupabase } from '../../../../lib/marketing/supabase';
import { CatalogError, loadProduct } from '../../../../lib/catalog/repository';
import { buildChannelPackage } from '../../../../lib/catalog/actions';
import { buildSellerExport } from '../../../../lib/catalog/contracts';
import { isChannel } from '../../../../lib/catalog/model';
import { assertFamily } from '../../../../lib/catalog/family';

export async function GET(req: NextRequest) {
  const auth = await resolveAuthContext(req); if (!auth) return NextResponse.json(unauthorized(), { status: 401 });
  const db = getSupabase(); if (!db) return NextResponse.json({ error: 'Supabase não configurado.' }, { status: 503 });
  try {
    const loaded = await loadProduct(db, auth, req.nextUrl.searchParams.get('sku') || '');
    const rawChannel = req.nextUrl.searchParams.get('channel'); const channel = isChannel(rawChannel) ? rawChannel : 'amazon-us';
    await assertFamily(db, auth, loaded.product, channel);
    const pack = buildChannelPackage(loaded.product, channel);
    const csv = req.nextUrl.searchParams.get('format') === 'csv';
    if (csv && channel !== 'amazon-us') throw new CatalogError('Use o pacote JSON específico deste canal.');
    const body = csv ? buildSellerExport({ ...loaded.product, human_reviewed: true, template_key: 'fbrsigns_sign', template_version: '2026-01' }).csv : JSON.stringify(pack, null, 2);
    const name = String(loaded.product.sku).replace(/[^a-zA-Z0-9_-]/g, '_');
    return new NextResponse(body, { headers: { 'content-type': csv ? 'text/csv;charset=utf-8' : 'application/json', 'content-disposition': `attachment; filename="${name}-${channel}.${csv ? 'csv' : 'json'}"`, 'cache-control': 'no-store' } });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Falha na exportação.' }, { status: error instanceof CatalogError ? error.status : 500 }); }
}
