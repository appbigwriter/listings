import {NextRequest,NextResponse} from 'next/server';
import {resolveAuthContext,unauthorized} from '../../../../lib/auth';
import {getSupabase} from '../../../../lib/marketing/supabase';
import {listMarketplaceAccounts,saveMarketplaceAccount} from '../../../../lib/marketplaces/account-registry';
import {readJsonBody,RequestBodyError} from '../../../../lib/http';
import {CatalogError} from '../../../../lib/catalog/repository';
import {traceRequest} from '../../../../lib/operations/trace';
export function GET(req:NextRequest){return traceRequest('api.catalog.accounts',async()=>{const auth=await resolveAuthContext(req);if(!auth)return NextResponse.json(unauthorized(),{status:401});const db=getSupabase();if(!db)return NextResponse.json({error:'Supabase indisponível.'},{status:503});try{return NextResponse.json({data:await listMarketplaceAccounts(db,auth)});}catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Falha ao listar contas.'},{status:error instanceof CatalogError?error.status:503});}});}
export function POST(req:NextRequest){return traceRequest('api.catalog.accounts',async()=>{const auth=await resolveAuthContext(req);if(!auth)return NextResponse.json(unauthorized(),{status:401});const db=getSupabase();if(!db)return NextResponse.json({error:'Supabase indisponível.'},{status:503});try{return NextResponse.json({data:await saveMarketplaceAccount(db,auth,await readJsonBody(req,12000))},{status:201});}catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Falha ao salvar conta.'},{status:error instanceof CatalogError||error instanceof RequestBodyError?error.status:503});}});}
