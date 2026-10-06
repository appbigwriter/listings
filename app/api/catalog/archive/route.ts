import {traceRequest} from '../../../../lib/operations/trace';
import {NextRequest,NextResponse} from 'next/server';
import {hasCapability,resolveAuthContext,unauthorized} from '../../../../lib/auth';
import {getSupabase} from '../../../../lib/marketing/supabase';
import {readJsonBody,RequestBodyError} from '../../../../lib/http';
import {CatalogError,scopeQuery} from '../../../../lib/catalog/repository';
import {setArchive} from '../../../../lib/catalog/archive';
export const runtime='nodejs';
async function handleGET(req:NextRequest){
 const auth=await resolveAuthContext(req);if(!auth)return NextResponse.json(unauthorized(),{status:401});
 const db=getSupabase();if(!db)return NextResponse.json({error:'Supabase não configurado.'},{status:503});
 const raw=Number(req.nextUrl.searchParams.get('offset')||0);if(!Number.isSafeInteger(raw)||raw<0||raw>100000)return NextResponse.json({error:'Página inválida.'},{status:400});
 const result=await scopeQuery(db.from('prelistings').select('sku,title,updated_at,archived_at,payload',{count:'exact'}),auth).eq('status','archived').order('sku').range(raw,raw+19);
 if(result.error)return NextResponse.json({error:'Falha ao consultar arquivos.'},{status:503});
 return NextResponse.json({data:(result.data||[]).map((row:any)=>({sku:row.sku,title:row.title,updated_at:row.updated_at,archived_at:row.archived_at,reason:row.payload?.archive_transition?.reason||'Motivo não registrado no legado'})),total:result.count,offset:raw,can_archive:hasCapability(auth,'admin')},{headers:{'cache-control':'private, no-store'}});
}
async function handlePOST(req:NextRequest){try{
 const auth=await resolveAuthContext(req);if(!auth)return NextResponse.json(unauthorized(),{status:401});
 const db=getSupabase();if(!db)return NextResponse.json({error:'Supabase não configurado.'},{status:503});
 return NextResponse.json({data:await setArchive(db,auth,await readJsonBody(req,16384))});
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Falha no arquivamento.'},{status:error instanceof CatalogError||error instanceof RequestBodyError?error.status:500});}}

export function GET(req:NextRequest){return traceRequest('api.catalog.archive',()=>handleGET(req));}

export function POST(req:NextRequest){return traceRequest('api.catalog.archive',()=>handlePOST(req));}
