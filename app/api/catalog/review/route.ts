import { NextRequest,NextResponse } from 'next/server';
import { resolveAuthContext,unauthorized } from '../../../../lib/auth';
import { getSupabase } from '../../../../lib/marketing/supabase';
import { readJsonBody,RequestBodyError } from '../../../../lib/http';
import { CatalogError } from '../../../../lib/catalog/repository';
import { isChannel } from '../../../../lib/catalog/model';
import { previewBatchReview,approveBatchReview } from '../../../../lib/catalog/batch-review';
export async function POST(req:NextRequest) {
  const auth=await resolveAuthContext(req);if(!auth)return NextResponse.json(unauthorized(),{status:401});
  const db=getSupabase();if(!db)return NextResponse.json({error:'Supabase não configurado.'},{status:503});
  try {
    const body=await readJsonBody(req,120000);
    if(!isChannel(body.channel))throw new CatalogError('Canal inválido.');
    if(body.action==='approve')return NextResponse.json({outcomes:await approveBatchReview(db,auth,body.entries,body.channel,body.confirm)});
    if(body.action && body.action!=='preview')throw new CatalogError('Ação inválida.');
    return NextResponse.json({items:await previewBatchReview(db,auth,body.skus,body.channel)});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Falha na revisão.'},{status:error instanceof CatalogError||error instanceof RequestBodyError?error.status:500});}
}
