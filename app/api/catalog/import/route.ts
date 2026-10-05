import { readJsonBody, RequestBodyError } from '../../../../lib/http';
import { NextRequest, NextResponse } from 'next/server';
import { resolveAuthContext, unauthorized } from '../../../../lib/auth';
import { getSupabase } from '../../../../lib/marketing/supabase';
import { parseCatalog, previewImport } from '../../../../lib/catalog/import';
import { fetchSourceCatalog } from '../../../../lib/catalog/source';
import { enqueueJob } from '../../../../lib/catalog/jobs';
import { CatalogError } from '../../../../lib/catalog/repository';

export const runtime = 'nodejs';
export async function POST(req: NextRequest) {
  const auth = await resolveAuthContext(req); if (!auth) return NextResponse.json(unauthorized(), { status: 401 });
  try {
    if (Number(req.headers.get('content-length')) > 6_000_000) throw new CatalogError('Importação acima de 5 MB.', 413);
    const body = await readJsonBody(req); const source = String(body.source || 'arquivo').slice(0, 200);
    const rows = body.source === 'configured' ? await fetchSourceCatalog() : parseCatalog(String(body.text || ''), body.format === 'csv' ? 'csv' : 'json');
    const preview = previewImport(rows, source);
    if (body.confirm !== true) return NextResponse.json({ preview, valid: preview.filter(item => item.product).length, invalid: preview.filter(item => item.error).length });
    if (preview.some(item => item.error)) throw new CatalogError('Corrija os produtos inválidos antes de importar.');
    const db = getSupabase(); if (!db) throw new CatalogError('Supabase não configurado.', 503);
    const job = await enqueueJob(db, auth, 'import', { products: preview.map(item => item.product), source });
    return NextResponse.json({ job }, { status: 202 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Falha na importação.' }, { status: error instanceof CatalogError || error instanceof RequestBodyError ? error.status : 502 }); }
}
