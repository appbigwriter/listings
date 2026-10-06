import {NextRequest,NextResponse} from 'next/server';
import {resolveAuthContext,unauthorized} from '../../../../lib/auth';
import {getSupabase} from '../../../../lib/marketing/supabase';
import {readJsonBody,RequestBodyError} from '../../../../lib/http';
import {CatalogError} from '../../../../lib/catalog/repository';
import {prepareEbay,submitEbay,monitorEbay} from '../../../../lib/catalog/ebay-executor';
export async function POST(req:NextRequest) {
 const auth=await resolveAuthContext(req);if(!auth)return NextResponse.json(unauthorized(),{status:401});
 const db=getSupabase();if(!db)return NextResponse.json({error:'Supabase não configurado.'},{status:503});
 try {
  const body=await readJsonBody(req,12000);if(typeof body.sku!=='string'||!body.sku.trim())throw new CatalogError('SKU obrigatório.');
  if(body.action==='submit')return NextResponse.json(await submitEbay(db,auth,body),{status:202});
  if(body.action==='monitor')return NextResponse.json(await monitorEbay(db,auth,body.sku));
  if(body.action&&body.action!=='prepare')throw new CatalogError('Ação eBay inválida.');
  return NextResponse.json({...await prepareEbay(db,auth,body.sku),publication:'not_submitted'});
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Falha na operação eBay.'},{status:error instanceof CatalogError||error instanceof RequestBodyError?error.status:502});}
}
