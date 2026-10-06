import {channelProduct,type ProductInput} from '../catalog/model';
import {CatalogError} from '../catalog/repository';
import {ebayRead} from './adapters';
import {isNumericInput} from '../catalog/numeric-input';
const text=(value:unknown)=>String(value||'').trim();
const escape=(value:string)=>value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
export function buildEbayPackage(product:ProductInput,options:{familyMember?:boolean}={}) {
  product=channelProduct(product,'ebay-us');
  if(product.relationship==='Parent'||product.relationship==='Child'&&!options.familyMember)throw new CatalogError('Famílias eBay exigem Inventory Item Group; este pacote aceita somente standalone.',422);
  const listing=product._catalog?.channels['ebay-us'];if(!listing||!/^\d+$/.test(listing.category))throw new CatalogError('Selecione uma categoria eBay válida.',422);
  if(product.ebay_condition!=='NEW')throw new CatalogError('Confirme a condição NEW para o fluxo FBRSigns; outras condições precisam de adaptação.',422);
  const title=text(product.title);if(!title||[...title].length>80)throw new CatalogError('Título eBay deve ter entre 1 e 80 caracteres.',422);
  const price=Number(product.price),qty=Number(product.qty);
  if(product.currency!==undefined&&product.currency!=='USD'||!isNumericInput(product.price)||price<=0||!Number.isSafeInteger(Math.round(price*100))||Math.abs(price*100-Math.round(price*100))>0.00001||!isNumericInput(product.qty)||!Number.isSafeInteger(qty)||qty<0)throw new CatalogError('Informe preço USD com até duas casas e estoque inteiro.',422);
  const policies={paymentPolicyId:text(product.ebay_payment_policy),returnPolicyId:text(product.ebay_return_policy),fulfillmentPolicyId:text(product.ebay_fulfillment_policy)};
  const location=text(product.ebay_location);if(!location||Object.values(policies).some(id=>!/^\d+$/.test(id)))throw new CatalogError('Selecione localização e as três business policies da própria conta.',422);
  const description=text(product.description);if(!description)throw new CatalogError('Descrição eBay obrigatória.',422);
  const images=Array.isArray(product.images)?product.images.map(String):String(product.images||'').split(/\n+/).filter(Boolean);
  if(!images.length||images.length>24||images.some(url=>!url.startsWith('https://')))throw new CatalogError('Informe imagens HTTPS para o eBay.',422);
  const identifiers:{mpn?:string;[key:string]:unknown}={};
  if(product.gtin){const key=String(product.id_type).toUpperCase();if(!['UPC','EAN','ISBN'].includes(key))throw new CatalogError('Tipo de identificador eBay precisa ser UPC, EAN ou ISBN.',422);identifiers[key.toLowerCase()]=[String(product.gtin)];}
  if(product.mpn)identifiers.mpn=String(product.mpn);
  if(!product.gtin&&!(product.brand&&product.mpn))throw new CatalogError('Informe GTIN ou Brand/MPN comprovados. ASIN e isenção Amazon não identificam um produto eBay.',422);
  if([product.pkg_length,product.pkg_width,product.pkg_height,product.pkg_weight].some(value=>!isNumericInput(value)||Number(value)<=0))throw new CatalogError('Embalagem e peso obrigatórios.',422);
  const html=escape(description).replace(/\r?\n/g,'<br>');
  const inventory={availability:{shipToLocationAvailability:{quantity:qty}},condition:'NEW',product:{title,description:html,brand:text(product.brand),aspects:listing.attributes,imageUrls:images,...identifiers},packageWeightAndSize:{dimensions:{length:Number(product.pkg_length),width:Number(product.pkg_width),height:Number(product.pkg_height),unit:'INCH'},weight:{value:Number(product.pkg_weight),unit:'POUND'}}};
  const offer={sku:String(product.sku),marketplaceId:'EBAY_US',format:'FIXED_PRICE',includeCatalogProductDetails:false,availableQuantity:qty,categoryId:listing.category,merchantLocationKey:location,listingPolicies:policies,listingDescription:html,pricingSummary:{price:{currency:'USD',value:price.toFixed(2)}}};
  return {format:'ebay-inventory-offer-preparation-v1',inventory,offer,publication:'not_submitted',required_live_checks:['category_condition_policy','business_policies','inventory_location','account_opt_in','inventory_offer_publish_readback']};
}
export async function ebayAccountPreparation(category:string) {
  if(!/^\d+$/.test(category))throw new CatalogError('Categoria eBay inválida.');
  const [payment,fulfillment,returns,locations,conditions]=await Promise.all([
    ebayRead('/sell/account/v1/payment_policy?marketplace_id=EBAY_US'),
    ebayRead('/sell/account/v1/fulfillment_policy?marketplace_id=EBAY_US'),
    ebayRead('/sell/account/v1/return_policy?marketplace_id=EBAY_US'),
    ebayRead('/sell/inventory/v1/location?limit=100'),
    ebayRead(`/sell/metadata/v1/marketplace/EBAY_US/get_item_condition_policies?filter=${encodeURIComponent(`categoryIds:{${category}}`)}`),
  ]);
  return {marketplace:'EBAY_US',category,payment,fulfillment,returns,locations,conditions,selection:'human_review_required',locations_may_require_pagination:true,checked_at:new Date().toISOString()};
}
