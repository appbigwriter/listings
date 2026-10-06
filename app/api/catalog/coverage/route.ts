import {NextRequest,NextResponse} from 'next/server';
import {resolveAuthContext,unauthorized} from '../../../../lib/auth';
import {getSupabase} from '../../../../lib/marketing/supabase';
import {CatalogError,scopeQuery} from '../../../../lib/catalog/repository';
import {hash,isChannel} from '../../../../lib/catalog/model';
import {coverageItem} from '../../../../lib/catalog/coverage';
export const runtime='nodejs';
export async function GET(req:NextRequest){try{
 const auth=await resolveAuthContext(req);if(!auth)return NextResponse.json(unauthorized(),{status:401});
 const channel=req.nextUrl.searchParams.get('channel')||'amazon-us';if(!isChannel(channel))throw new CatalogError('Canal inválido.');
 const offset=Number(req.nextUrl.searchParams.get('offset')||0),limit=Number(req.nextUrl.searchParams.get('limit')||100);
 if(!Number.isInteger(offset)||offset<0||offset>5000||!Number.isInteger(limit)||limit<1||limit>100)throw new CatalogError('Página inválida: offset até 5.000, limit de 1 a 100.');
 const db=getSupabase();if(!db)throw new CatalogError('Supabase não configurado.',503);
 const rows=await scopeQuery(db.from('prelistings').select('sku,title,brand,status,payload,owner_id,updated_at',{count:'exact'}),auth).order('sku').range(offset,offset+limit-1);
 if(rows.error||rows.count===null)throw new CatalogError('Não foi possível contabilizar o catálogo.',503);
 if(rows.count>5000)throw new CatalogError('Escopo acima de 5.000 produtos. Refine o catálogo antes de exportar.',413);
 const skus=(rows.data||[]).map((row:{sku:string})=>row.sku);
 const ledger=skus.length?await scopeQuery(db.from('catalog_submissions').select('sku'),auth).eq('channel',channel).in('sku',skus).in('status',['submitting','unknown']):{data:[],error:null};
 if(ledger.error)throw new CatalogError('Não foi possível conferir envios incertos.',503);
 const uncertain=new Set((ledger.data||[]).map((row:{sku:string})=>row.sku)),checked_at=new Date().toISOString(),data=(rows.data||[]).map((row:Record<string,any>)=>coverageItem(row,channel,uncertain.has(row.sku)));
 return NextResponse.json({scope:'current_owner_in_organization',organization_id:auth.organizationId,owner_id:auth.userId,channel,total:rows.count,offset,limit,checked_at,data,page_hash:hash(data),includes_archived:true,population_basis:'owned_prelistings_only',source_store_population_reconciled:false,snapshot_consistency:'observations_per_page_not_atomic'}, {headers:{'cache-control':'private, no-store'}});
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Falha ao contabilizar cobertura.'},{status:error instanceof CatalogError?error.status:500});}}
