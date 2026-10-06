import {NextRequest,NextResponse} from 'next/server';
import {resolveAuthContext,hasCapability,unauthorized} from '../../../../lib/auth';
import {getSupabase} from '../../../../lib/marketing/supabase';
import {CatalogError,scopeQuery} from '../../../../lib/catalog/repository';
import {INCIDENT_ACTIONS,reconcileIncidents} from '../../../../lib/operations/incidents';
import {traceRequest} from '../../../../lib/operations/trace';
import {readJsonBody,RequestBodyError} from '../../../../lib/http';
export function GET(req:NextRequest){return traceRequest('api.catalog.incidents',async()=>{
 const auth=await resolveAuthContext(req);if(!auth)return NextResponse.json(unauthorized(),{status:401});const db=getSupabase();if(!db)return NextResponse.json({error:'Supabase indisponível.'},{status:503});
 const result=await scopeQuery(db.from('catalog_incidents').select('*'),auth).neq('status','resolved').order('last_seen_at',{ascending:false}).limit(100);
 return NextResponse.json(result.error?{error:'Incidentes indisponíveis.'}:{data:(result.data||[]).map((item:any)=>({...item,action:INCIDENT_ACTIONS[item.rule]})),limit:100,external_notifications_enabled:false},{status:result.error?503:200});
});}
export function POST(req:NextRequest){return traceRequest('api.catalog.incidents',async()=>{
 const auth=await resolveAuthContext(req);if(!auth)return NextResponse.json(unauthorized(),{status:401});if(!hasCapability(auth,'admin'))return NextResponse.json({error:'Administrador obrigatório.'},{status:403});const db=getSupabase();if(!db)return NextResponse.json({error:'Supabase indisponível.'},{status:503});
 try{const body=await readJsonBody(req);if(body.action!=='evaluate')throw new CatalogError('Ação de incidente inválida.');return NextResponse.json(await reconcileIncidents(db,auth));}catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Falha operacional.'},{status:error instanceof CatalogError||error instanceof RequestBodyError?error.status:500});}
});}
