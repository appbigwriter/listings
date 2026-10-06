import { setArchive } from '../../../lib/catalog/archive';
import { readJsonBody,RequestBodyError } from '../../../lib/http';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '../../../lib/marketing/supabase';
import { resolveAuthContext, unauthorized } from '../../../lib/auth';
import { createCatalog } from '../../../lib/catalog/model';
import { CatalogError, loadProduct, mergeDraft, persistProduct, scopeQuery,editableProductPatch } from '../../../lib/catalog/repository';

export const runtime = 'nodejs';
function errorResponse(error: unknown) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Falha no catálogo.' }, { status: error instanceof CatalogError||error instanceof RequestBodyError ? error.status : 500 }); }
export async function GET(req: NextRequest) {
  const auth = await resolveAuthContext(req); if (!auth) return NextResponse.json(unauthorized(), { status: 401 });
  const db = getSupabase(); if (!db) return NextResponse.json({ error: 'Supabase não configurado.' }, { status: 503 });
  try {
    const sku = req.nextUrl.searchParams.get('sku');
    if (sku) return NextResponse.json({ data: (await loadProduct(db, auth, sku)).row });
    const offset = Math.max(0, Math.floor(Number(req.nextUrl.searchParams.get('offset')) || 0));
    const limit = Math.min(100, Math.max(1, Math.floor(Number(req.nextUrl.searchParams.get('limit')) || 50)));
    let query = db.from('prelistings').select('*', { count: 'exact' }).eq('organization_id',auth.organizationId).eq('owner_id',auth.userId).neq('status', 'archived');
    const search = req.nextUrl.searchParams.get('search');
    if (search) query = query.ilike('title', `%${search.replace(/[%_]/g, '')}%`);
    const result = await query.order('sku', { ascending: true }).range(offset, offset + limit - 1);
    if (result.error) throw new CatalogError('Falha ao carregar catálogo.', 503);
    return NextResponse.json({ data: result.data, total: result.count, offset, limit });
  } catch (error) { return errorResponse(error); }
}
export async function POST(req: NextRequest) {
  const auth = await resolveAuthContext(req); if (!auth) return NextResponse.json(unauthorized(), { status: 401 });
  const db = getSupabase(); if (!db) return NextResponse.json({ error: 'Supabase não configurado.' }, { status: 503 });
  try { const body=editableProductPatch(await readJsonBody(req)); const product = { ...body, human_reviewed: false, _catalog: createCatalog(body) }; return NextResponse.json({ data: await persistProduct(db, auth, product) }, { status: 201 }); }
  catch (error) { return errorResponse(error); }
}
export async function PATCH(req: NextRequest) {
  const auth = await resolveAuthContext(req); if (!auth) return NextResponse.json(unauthorized(), { status: 401 });
  const db = getSupabase(); if (!db) return NextResponse.json({ error: 'Supabase não configurado.' }, { status: 503 });
  try {
    const body = await readJsonBody(req); const loaded = await loadProduct(db, auth, String(body.sku || ''));
    if (body.updated_at && body.updated_at !== loaded.row.updated_at) throw new CatalogError('Versão desatualizada. Recarregue o produto.', 409);
    const patch = body.payload || Object.fromEntries(Object.entries(body).filter(([key]) => !['sku', 'updated_at'].includes(key)));
    return NextResponse.json({ data: await persistProduct(db, auth, mergeDraft(loaded.product, patch,auth.userId), loaded.row) });
  } catch (error) { return errorResponse(error); }
}
export async function DELETE(req: NextRequest) {
  const auth = await resolveAuthContext(req); if (!auth) return NextResponse.json(unauthorized(), { status: 401 });
  const db = getSupabase(); if (!db) return NextResponse.json({ error: 'Supabase não configurado.' }, { status: 503 });
  try {const body=await readJsonBody(req,16384);return NextResponse.json({data:await setArchive(db,auth,{...body,archive:true})});}
  catch (error) { return errorResponse(error); }
}
