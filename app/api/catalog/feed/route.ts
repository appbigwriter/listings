import { NextRequest,NextResponse } from 'next/server';
import { resolveAuthContext,unauthorized } from '../../../../lib/auth';
import { getSupabase } from '../../../../lib/marketing/supabase';
import { readJsonBody,RequestBodyError } from '../../../../lib/http';
import { CatalogError,loadProduct } from '../../../../lib/catalog/repository';
import { assertFamily } from '../../../../lib/catalog/family';
import { contentHash } from '../../../../lib/catalog/model';
import { buildAmazonFeed } from '../../../../lib/catalog/feed';
export async function POST(req:NextRequest) {
  const auth=await resolveAuthContext(req); if (!auth) return NextResponse.json(unauthorized(),{status:401});
  const db=getSupabase(); if (!db) return NextResponse.json({error:'Supabase não configurado.'},{status:503});
  try {
    const body=await readJsonBody(req);
    if (!Array.isArray(body.skus) || !body.skus.length || body.skus.length>5000 || body.skus.some((sku:unknown)=>typeof sku!=='string')) throw new CatalogError('Seleção inválida.');
    const products=[];
    for (const sku of [...new Set<string>(body.skus)]) {
      const {product}=await loadProduct(db,auth,sku); await assertFamily(db,auth,product,'amazon-us'); products.push(product);
    }
    const feed=buildAmazonFeed(products);
    return NextResponse.json({feed,versions:products.map(product=>({sku:product.sku,hash:contentHash(product)})),publication:'not_submitted'});
  } catch(error) { return NextResponse.json({error:error instanceof Error?error.message:'Falha ao preparar feed.'},{status:error instanceof CatalogError || error instanceof RequestBodyError?error.status:500}); }
}
