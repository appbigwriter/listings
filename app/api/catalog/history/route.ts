import {traceRequest} from '../../../../lib/operations/trace';
import { NextRequest,NextResponse } from 'next/server';
import { resolveAuthContext,unauthorized } from '../../../../lib/auth';
import { getSupabase } from '../../../../lib/marketing/supabase';
import { scopeQuery } from '../../../../lib/catalog/repository';
async function handleGET(req:NextRequest) {
  const auth=await resolveAuthContext(req); if (!auth) return NextResponse.json(unauthorized(),{status:401});
  const db=getSupabase(); if (!db) return NextResponse.json({error:'Supabase não configurado.'},{status:503});
  const result=await scopeQuery(db.from('catalog_versions').select('id,sku,snapshot,fingerprint,created_at'),auth).eq('sku',req.nextUrl.searchParams.get('sku') || '').order('created_at',{ascending:false}).limit(30);
  return NextResponse.json(result.error ? {error:'Histórico indisponível.'}:{data:result.data},{status:result.error?503:200});
}

export function GET(req:NextRequest){return traceRequest('api.catalog.history',()=>handleGET(req));}
