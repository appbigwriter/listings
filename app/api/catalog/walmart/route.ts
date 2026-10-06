import {NextRequest,NextResponse} from 'next/server';
import {resolveAuthContext,unauthorized} from '../../../../lib/auth';
import {getSupabase} from '../../../../lib/marketing/supabase';
import {readJsonBody,RequestBodyError} from '../../../../lib/http';
import {CatalogError} from '../../../../lib/catalog/repository';
import {prepareWalmart,submitWalmart,monitorWalmart} from '../../../../lib/catalog/walmart-executor';
import {traceRequest} from '../../../../lib/operations/trace';
export function POST(req:NextRequest){return traceRequest('api.catalog.walmart',async()=>{
 const auth=await resolveAuthContext(req);if(!auth)return NextResponse.json(unauthorized(),{status:401});const db=getSupabase();if(!db)return NextResponse.json({error:'Supabase indisponível.'},{status:503});
 try{const body=await readJsonBody(req,12000);if(typeof body.sku!=='string'||!body.sku.trim())throw new CatalogError('SKU obrigatório.');
  if(body.action==='submit')return NextResponse.json(await submitWalmart(db,auth,body),{status:202});
  if(body.action==='monitor')return NextResponse.json(await monitorWalmart(db,auth,body.sku));
  if(body.action&&body.action!=='prepare')throw new CatalogError('Ação Walmart inválida.');
  return NextResponse.json(await prepareWalmart(db,auth,body.sku));
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Falha Walmart.'},{status:error instanceof CatalogError||error instanceof RequestBodyError?error.status:502});}
});}
