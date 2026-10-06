import {traceRequest} from '../../../../lib/operations/trace';
import { NextRequest,NextResponse } from 'next/server';
import { resolveAuthContext,unauthorized } from '../../../../lib/auth';
import { getSupabase } from '../../../../lib/marketing/supabase';
import { readJsonBody,RequestBodyError } from '../../../../lib/http';
import { CatalogError } from '../../../../lib/catalog/repository';
import { prepareFeed,submitFeed,monitorFeed,recoverFeedId } from '../../../../lib/catalog/feed-executor';
import { scopeQuery } from '../../../../lib/catalog/repository';
async function handlePOST(req:NextRequest) {
  const auth=await resolveAuthContext(req); if (!auth) return NextResponse.json(unauthorized(),{status:401});
  const db=getSupabase(); if (!db) return NextResponse.json({error:'Supabase não configurado.'},{status:503});
  try {
    const body=await readJsonBody(req);
    if(body.action==='recover-id')return NextResponse.json(await recoverFeedId(db,auth,String(body.id),String(body.feed_id),body.evidence,body.confirm));
    if(body.action==='monitor')return NextResponse.json(await monitorFeed(db,auth,String(body.id)));
    if (!Array.isArray(body.skus) || !body.skus.length || body.skus.length>5000 || body.skus.some((sku:unknown)=>typeof sku!=='string')) throw new CatalogError('Seleção inválida.');
    if(body.action==='submit')return NextResponse.json(await submitFeed(db,auth,body.skus,String(body.expected_hash),body.confirm,body.retry_of),{status:202});
    if(body.action && body.action!=='prepare')throw new CatalogError('Ação de feed inválida.');
    const prepared=await prepareFeed(db,auth,body.skus);
    return NextResponse.json({...prepared,publication:'not_submitted'});
  } catch(error) { return NextResponse.json({error:error instanceof Error?error.message:'Falha ao preparar feed.'},{status:error instanceof CatalogError || error instanceof RequestBodyError?error.status:500}); }
}
async function handleGET(req:NextRequest) {
  const auth=await resolveAuthContext(req);if(!auth)return NextResponse.json(unauthorized(),{status:401});
  const db=getSupabase();if(!db)return NextResponse.json({error:'Supabase não configurado.'},{status:503});
  const result=await scopeQuery(db.from('catalog_feeds').select('id,status,feed_id,processing_status,created_at,updated_at,manifest,manifest_hash,document_id,target,result_document_id,attempt_no,retry_of'),auth).order('created_at',{ascending:false}).limit(20);
  return NextResponse.json(result.error?{error:'Fila de feeds indisponível.'}:{data:result.data},{status:result.error?503:200});
}

export function POST(req:NextRequest){return traceRequest('api.catalog.feed',()=>handlePOST(req));}

export function GET(req:NextRequest){return traceRequest('api.catalog.feed',()=>handleGET(req));}
