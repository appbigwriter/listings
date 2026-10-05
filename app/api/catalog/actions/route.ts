import { readJsonBody, RequestBodyError } from '../../../../lib/http';
import { NextRequest, NextResponse } from 'next/server';
import { resolveAuthContext, unauthorized } from '../../../../lib/auth';
import { getSupabase } from '../../../../lib/marketing/supabase';
import { buildChannelPackage } from '../../../../lib/catalog/actions';
import { executeAction } from '../../../../lib/catalog/executor';
import { CatalogError, loadProduct, persistProduct } from '../../../../lib/catalog/repository';
import { contentHash, isChannel } from '../../../../lib/catalog/model';
import { assertFamily } from '../../../../lib/catalog/family';

export const runtime = 'nodejs';
export async function POST(req: NextRequest) {
  const auth = await resolveAuthContext(req); if (!auth) return NextResponse.json(unauthorized(), { status: 401 });
  const db = getSupabase(); if (!db) return NextResponse.json({ error: 'Supabase não configurado.' }, { status: 503 });
  try {
    const body = await readJsonBody(req); const loaded = await loadProduct(db, auth, String(body.sku || ''));
    if (body.updated_at && body.updated_at !== loaded.row.updated_at) throw new CatalogError('O produto mudou. Recarregue antes da ação.', 409);
    if (body.action === 'export') {
      if (!isChannel(body.channel)) throw new CatalogError('Canal inválido.');
      await assertFamily(db, auth, loaded.product, body.channel);
      return NextResponse.json({ package: buildChannelPackage(loaded.product, body.channel) });
    }
    return NextResponse.json(await executeAction(db, auth, String(body.sku), String(body.action), body));
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Falha na operação.' }, { status: error instanceof CatalogError || error instanceof RequestBodyError ? error.status : 502 }); }
}
