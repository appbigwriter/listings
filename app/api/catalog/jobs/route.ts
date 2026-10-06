import {traceRequest} from '../../../../lib/operations/trace';
import { readJsonBody, RequestBodyError } from '../../../../lib/http';
import { NextRequest, NextResponse } from 'next/server';
import { resolveAuthContext, unauthorized } from '../../../../lib/auth';
import { getSupabase } from '../../../../lib/marketing/supabase';
import { cancelJob, enqueueJob, JOB_KINDS, processJob,retryJob, type JobKind } from '../../../../lib/catalog/jobs';
import { CatalogError, loadProduct, scopeQuery } from '../../../../lib/catalog/repository';
import { isChannel } from '../../../../lib/catalog/model';

export const runtime = 'nodejs';
async function handleGET(req: NextRequest) {
  const auth = await resolveAuthContext(req); if (!auth) return NextResponse.json(unauthorized(), { status: 401 });
  const db = getSupabase(); if (!db) return NextResponse.json({ error: 'Supabase não configurado.' }, { status: 503 });
  const result = await scopeQuery(db.from('catalog_jobs').select('id,kind,status,total,cursor,attempts,next_attempt_at,results,created_at,updated_at'), auth).order('created_at', { ascending: false }).limit(20);
  return NextResponse.json(result.error ? { error: 'Fila indisponível. Aplique a migration de catálogo.' } : { data: result.data }, { status: result.error ? 503 : 200 });
}
async function handlePOST(req: NextRequest) {
  const auth = await resolveAuthContext(req); if (!auth) return NextResponse.json(unauthorized(), { status: 401 });
  const db = getSupabase(); if (!db) return NextResponse.json({ error: 'Supabase não configurado.' }, { status: 503 });
  try {
    const body = await readJsonBody(req);
    if (body.action === 'cancel') return NextResponse.json({ job: await cancelJob(db,auth,String(body.id)) });
    if (body.action === 'retry') return NextResponse.json({job:await retryJob(db,auth,body)});
    if (body.action === 'process') return NextResponse.json({ job: await processJob(db, auth, String(body.id)) });
    if (!JOB_KINDS.includes(body.kind) || body.kind === 'import' || !Array.isArray(body.skus) || body.skus.length > 5000 || !isChannel(body.channel)) throw new CatalogError('Processamento inválido.');
    const skus: string[] = [...new Set<string>(body.skus.map((value: unknown) => String(value)))];
    const versions: Record<string, string> = {};
    for (let offset = 0; offset < skus.length; offset += 100) {
      const found = await scopeQuery(db.from('prelistings').select('sku,updated_at'), auth).in('sku', skus.slice(offset, offset + 100)).neq('status', 'archived');
      if (found.error || found.data.length !== skus.slice(offset, offset + 100).length) throw new CatalogError('Algum SKU não pertence ao catálogo ativo.', 404);
      for (const row of found.data) versions[row.sku] = row.updated_at;
    }
    return NextResponse.json({ job: await enqueueJob(db, auth, body.kind as JobKind, { skus, versions, channel: body.channel }) }, { status: 202 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Falha no processamento.' }, { status: error instanceof CatalogError || error instanceof RequestBodyError ? error.status : 500 }); }
}

export function GET(req:NextRequest){return traceRequest('api.catalog.jobs',()=>handleGET(req));}

export function POST(req:NextRequest){return traceRequest('api.catalog.jobs',()=>handlePOST(req));}
