export const LISTING_STATUSES = ['draft','ready','exported','archived'] as const;
export type ListingStatus = typeof LISTING_STATUSES[number];
export const SELLER_TEMPLATES = {
  fbrsigns_sign: { key:'fbrsigns_sign', name:'FBRSigns Sign / Decor', marketplace:'Amazon US', version:'2026-01', fields:['sku','item_name','brand_name','product_type','country_of_origin','product_description','item_package_dimensions_length','item_package_dimensions_width','item_package_dimensions_height','item_package_weight','standard_price','quantity','main_image_url','external_product_id','external_product_id_type','fulfillment_channel'] },
} as const;
export type ListingInput = Record<string, unknown> & { sku?: string; title?: string };
const text=(v:unknown)=>String(v??'').trim();
const positive=(v:unknown)=>Number.isFinite(Number(v))&&Number(v)>0;
export function validateListing(input: ListingInput) {
  const errors:string[]=[];
  if(!text(input.sku)) errors.push('sku_required');
  if(!text(input.title)) errors.push('title_required');
  if(!text(input.template_key) || !SELLER_TEMPLATES[String(input.template_key) as keyof typeof SELLER_TEMPLATES]) errors.push('template_required');
  if(!text(input.template_version)) errors.push('template_version_required');
  if(!positive(input.pkg_length)||!positive(input.pkg_width)||!positive(input.pkg_height)||!positive(input.pkg_weight)) errors.push('package_dimensions_required');
  if(!text(input.asin) && (!text(input.gtin) || !text(input.id_type))) errors.push('identity_required');
  if(!text(input.product_type)||!text(input.category)||!text(input.origin)) errors.push('amazon_attributes_required');
  const images=Array.isArray(input.images)?input.images:String(input.images??'').split(/\n+/).filter(Boolean);
  if(!images.length || !/^https?:\/\//i.test(String(images[0]))) errors.push('primary_image_required');
  if(!positive(input.price)||!positive(input.qty)) errors.push('offer_required');
  if(input.relationship==='Child' && !text(input.parent_sku)) errors.push('child_parent_required');
  if(input.human_reviewed !== true) errors.push('human_review_required');
  return {valid:errors.length===0, errors:[...new Set(errors)]};
}
export function buildSellerExport(input: ListingInput) {
  const validation=validateListing(input); if(!validation.valid) throw new Error(validation.errors.join(','));
  const template=SELLER_TEMPLATES[String(input.template_key) as keyof typeof SELLER_TEMPLATES];
  const metadata={sku:text(input.sku),template_key:template.key,template_version:text(input.template_version),status:'draft' as const,generated_at:new Date().toISOString(),publication:'manual Seller Central handoff only'};
  const headers=['sku','external_product_id','external_product_id_type','item_name','brand_name','manufacturer','product_type','country_of_origin','product_description','bullet_point','generic_keywords','item_package_dimensions_length','item_package_dimensions_width','item_package_dimensions_height','item_package_weight','standard_price','quantity','fulfillment_channel','main_image_url','other_image_url_1','other_image_url_2','parentage','relationship_type'];
  const images=Array.isArray(input.images)?input.images.map(String):String(input.images).split(/\n+/);
  const values=[input.sku,input.asin||input.gtin,input.id_type,input.title,input.brand,input.manufacturer,input.product_type,input.origin,input.description,input.bullets,input.keywords,input.pkg_length,input.pkg_width,input.pkg_height,input.pkg_weight,input.price,input.qty,input.fulfillment,images[0],images[1],images[2],input.relationship,input.relationship==='Child'?'child':''];
  const quote=(v:unknown)=>{const s=String(v??'').replace(/\r?\n/g,' | ');return /[",;]/.test(s)?`"${s.replaceAll('"','""')}"`:s};
  return {metadata,template,validation,csv:'\ufeff'+headers.map(quote).join(',')+'\n'+values.map(quote).join(','),json:{metadata,template:template.key,data:input}};
}
