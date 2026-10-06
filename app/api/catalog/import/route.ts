import { readJsonBody, RequestBodyError } from '../../../../lib/http';
import { NextRequest, NextResponse } from 'next/server';
import { resolveAuthContext, unauthorized } from '../../../../lib/auth';
import { getSupabase } from '../../../../lib/marketing/supabase';
import { parseCatalog, previewImport } from '../../../../lib/catalog/import';
import { fetchSourceCatalog } from '../../../../lib/catalog/source';
import { enqueueJob } from '../../../../lib/catalog/jobs';
import { CatalogError,scopeQuery } from '../../../../lib/catalog/repository';
import { sourceDiff } from '../../../../lib/catalog/source-diff';

export const runtime = 'nodejs';
export async function POST(req: NextRequest) {
  const auth = await resolveAuthContext(req); if (!auth) return NextResponse.json(unauthorized(), { status: 401 });
  try {
    if (Number(req.headers.get('content-length')) > 6_000_000) throw new CatalogError('Importação acima de 5 MB.', 413);
    const body = await readJsonBody(req); const source = body.source==='configured'?'loja-configurada':String(body.source || 'arquivo').slice(0, 200);
    const rows = body.source === 'configured' ? await fetchSourceCatalog() : parseCatalog(String(body.text || ''), body.format === 'csv' ? 'csv' : 'json');
    const preview = previewImport(rows, source);
    if (body.confirm !== true) {
      const db=getSupabase();const existing:{sku:string;source?:{id:string;hash:string}}[]=[];
      if(db)for(let offset=0;offset<=5000;offset+=500) {
        const loaded=await scopeQuery(db.from('prelistings').select('sku,payload'),auth).neq('status','archived').order('sku').range(offset,offset+499);
        if(loaded.error)throw new CatalogError('Falha ao comparar o catálogo existente.',503);
        if(offset===5000&&loaded.data?.length)throw new CatalogError('Catálogo existente excede o limite de comparação.',413);
        existing.push(...(loaded.data||[]).map((row:any)=>({sku:row.sku,source:row.payload?._catalog?.source})));
        if((loaded.data||[]).length<500)break;
      }
      const valid=preview.filter(item=>item.product),invalid=preview.filter(item=>item.error).length;
      return NextResponse.json({ preview,valid:valid.length,invalid,diff:sourceDiff(valid.map(item=>item.product!),existing,source,body.source==='configured'&&invalid===0) });
    }
    if (preview.some(item => item.error)) throw new CatalogError('Corrija os produtos inválidos antes de importar.');
    const db = getSupabase(); if (!db) throw new CatalogError('Supabase não configurado.', 503);
    const job = await enqueueJob(db, auth, 'import', { products: preview.map(item => item.product), source });
    return NextResponse.json({ job }, { status: 202 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Falha na importação.' }, { status: error instanceof CatalogError || error instanceof RequestBodyError ? error.status : 502 }); }
}
