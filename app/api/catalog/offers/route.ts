import {traceRequest} from '../../../../lib/operations/trace';
import {NextRequest,NextResponse} from 'next/server';
import {resolveAuthContext,unauthorized} from '../../../../lib/auth';
import {getSupabase} from '../../../../lib/marketing/supabase';
import {readJsonBody,RequestBodyError} from '../../../../lib/http';
import {CatalogError} from '../../../../lib/catalog/repository';
import {prepareOffer,submitOffer,saveOfferAuthority} from '../../../../lib/catalog/offers';
async function handlePOST(req:NextRequest) {
  const auth=await resolveAuthContext(req);if(!auth)return NextResponse.json(unauthorized(),{status:401});
  const db=getSupabase();if(!db)return NextResponse.json({error:'Supabase não configurado.'},{status:503});
  try {
    const body=await readJsonBody(req,12000);
    if(body.action==='authority')return NextResponse.json(await saveOfferAuthority(db,auth,body));
    if(body.action==='submit')return NextResponse.json(await submitOffer(db,auth,body));
    if(body.action&&body.action!=='prepare')throw new CatalogError('Ação inválida.');
    return NextResponse.json(await prepareOffer(db,auth,String(body.sku),body.fields,body.authority));
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Falha na oferta.'},{status:error instanceof CatalogError||error instanceof RequestBodyError?error.status:500});}
}

export function POST(req:NextRequest){return traceRequest('api.catalog.offers',()=>handlePOST(req));}
