import type {SupabaseClient} from '@supabase/supabase-js';
import type {AuthContext} from '../auth';
import {loadProduct,scopeQuery,productFromRow,CatalogError} from './repository';
import {buildEbayFamilyPackage} from '../marketplaces/ebay-family-package';
import {assertEbayAccount,ebayRequest} from '../marketplaces/ebay';
export async function prepareEbayFamily(db:SupabaseClient,auth:AuthContext,sku:string){
 const parent=await loadProduct(db,auth,sku),listing=parent.product._catalog?.channels['ebay-us'],schema=listing?.schema,family=listing?.family;
 if(parent.product.relationship!=='Parent'||!schema?.metadata||!family)throw new CatalogError('Carregue o contrato e configure os aspectos de variação do pai eBay.',422);
 const found=await scopeQuery(db.from('prelistings').select('*',{count:'exact'}),auth).eq('payload->>parent_sku',sku).neq('status','archived').order('sku').limit(251);
 if(found.error||!found.data||found.count!==found.data.length||found.data.length<2||found.data.length>250)throw new CatalogError('Família deve conter de 2 a 250 filhos ativos sem omissões.',422);
 const account=await assertEbayAccount();
 const structures=await ebayRequest(`/sell/metadata/v1/marketplace/EBAY_US/get_listing_structure_policies?filter=${encodeURIComponent(`categoryIds:{${listing.category}}`)}`);
 const matching=Array.isArray(structures.listingStructurePolicies)?structures.listingStructurePolicies.filter((policy:any)=>policy.categoryId===listing.category&&policy.categoryTreeId===schema.metadata!.category_tree_id):[];
 if(matching.length!==1||matching[0].variationsSupported!==true)throw new CatalogError('A categoria/árvore eBay não comprova suporte a variações.',422);
 const prepared=buildEbayFamilyPackage({parent:{product:parent.product,updated_at:parent.row.updated_at,owner_id:auth.userId,organization_id:auth.organizationId},children:found.data.map((row:any)=>({product:productFromRow(row),updated_at:row.updated_at,owner_id:row.owner_id,organization_id:row.organization_id})),taxonomy:schema.metadata.taxonomy,categoryId:listing.category,categoryTreeId:schema.metadata.category_tree_id,taxonomyVersion:schema.version,taxonomyFetchedAt:schema.fetched_at,variationAspects:family.variation_aspects,imageVariationAspect:family.image_variation_aspect,sellerId:account.account_id});
 return {...prepared,publication_enabled:false};
}
