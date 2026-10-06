import {NextRequest,NextResponse} from 'next/server';
import {resolveAuthContext,unauthorized} from '../../../lib/auth';
import {getSupabase} from '../../../lib/marketing/supabase';
import {getMarketingProfileContext} from '../../../lib/marketing/profile-guard';
import {CatalogError,productFromRow} from '../../../lib/catalog/repository';
import {amazonConfig} from '../../../lib/marketplaces/amazon';
import {currentAmazonFeeEstimate} from '../../../lib/marketplaces/amazon-fee-estimates';
import {estimatedAmazonMargin} from '../../../lib/marketing/fee-economics';
export const runtime='nodejs';
export async function GET(req:NextRequest){try{
 const auth=await resolveAuthContext(req);if(!auth)return NextResponse.json(unauthorized(),{status:401});
 const sku=req.nextUrl.searchParams.get('sku');if(!sku)throw new CatalogError('SKU obrigatório.');
 const db=getSupabase();if(!db)throw new CatalogError('Supabase não configurado.',503);
 const context=await getMarketingProfileContext(db,auth,sku);if(context.error)throw new CatalogError('Não foi possível conferir a economia.',503);
 if(!context.listing||context.archived)throw new CatalogError('SKU ativo não encontrado.',404);
 const estimate=currentAmazonFeeEstimate(productFromRow(context.listing),amazonConfig());
 let projection=null;const blockers:string[]=[];try{projection=estimatedAmazonMargin(context.profile?.economics?.costs,estimate);}catch(error){if(!(error instanceof CatalogError))throw error;blockers.push(error.message);}
 return NextResponse.json({data:{fee_estimate:estimate,estimated_margin:projection,manual_margin:context.profile?.economics?.margin||null,product_version:context.listing.updated_at,profile_version:context.profile?.updated_at||null,blockers,applied_to_profile:false}},{headers:{'cache-control':'private, no-store'}});
}catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Falha na projeção de economia.'},{status:error instanceof CatalogError?error.status:500});}}
