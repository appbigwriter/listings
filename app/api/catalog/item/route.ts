import {traceRequest} from '../../../../lib/operations/trace';
import { NextRequest, NextResponse } from 'next/server';
import { resolveAuthContext, unauthorized } from '../../../../lib/auth';
import { getSupabase } from '../../../../lib/marketing/supabase';
import { CatalogError, loadProduct } from '../../../../lib/catalog/repository';
import { contentHash, isChannel } from '../../../../lib/catalog/model';
import { evaluateReadiness } from '../../../../lib/catalog/readiness';
import { amazonAttributes } from '../../../../lib/marketplaces/amazon';
import {sourceComparisons} from '../../../../lib/catalog/field-provenance';
import {normalizeImportedProduct} from '../../../../lib/catalog/import';

async function handleGET(req: NextRequest) {
  const auth = await resolveAuthContext(req); if (!auth) return NextResponse.json(unauthorized(), { status: 401 });
  const db = getSupabase(); if (!db) return NextResponse.json({ error: 'Supabase não configurado.' }, { status: 503 });
  try { const rawChannel = req.nextUrl.searchParams.get('channel'); const channel = isChannel(rawChannel) ? rawChannel : 'amazon-us'; const loaded = await loadProduct(db, auth, req.nextUrl.searchParams.get('sku') || ''); const update=loaded.product.source_update as {id:string;snapshot:Record<string,unknown>}|undefined;return NextResponse.json({ product: loaded.product, source_comparisons:update?.snapshot?sourceComparisons(loaded.product,normalizeImportedProduct(update.snapshot,update.id)):[],updated_at: loaded.row.updated_at, content_hash: contentHash(loaded.product, channel), report: evaluateReadiness(loaded.product, channel), effective_attributes: channel === 'amazon-us' ? amazonAttributes(loaded.product) : loaded.product._catalog?.channels[channel]?.attributes || {} },{headers:{'cache-control':'private, no-store'}}); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Falha ao carregar.' }, { status: error instanceof CatalogError ? error.status : 500 }); }
}

export function GET(req:NextRequest){return traceRequest('api.catalog.item',()=>handleGET(req));}
