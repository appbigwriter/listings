import {channelProduct,hash,type ProductInput} from '../catalog/model';
import {validateSchema} from '../catalog/schema';
import {CatalogError} from '../catalog/repository';
import {isNumericInput} from '../catalog/numeric-input';
const record=(value:unknown):value is Record<string,any>=>Boolean(value)&&typeof value==='object'&&!Array.isArray(value);

/** Full account-derived Get Spec is required; taxonomy/aspect fragments are not a feed spec. */
export function buildWalmartPackage(input:ProductInput){
 const product=channelProduct(input,'walmart-us'),listing=product._catalog?.channels['walmart-us'],spec=listing?.schema;
 if(!spec||spec.channel!=='walmart-us'||spec.checksum!==hash(spec.schema)||spec.product_type!==listing?.product_type||spec.category!==listing.category||!Number.isFinite(Date.parse(spec.fetched_at))||Date.parse(spec.fetched_at)>Date.now()+300000||Date.now()-Date.parse(spec.fetched_at)>7*86400000)throw new CatalogError('Carregue a Get Spec vigente da classificação Walmart.',422);
 const properties=spec.schema.properties;
 if(!record(properties)||!properties.MPItemFeedHeader||!properties.MPItem)throw new CatalogError('Get Spec completa MP_ITEM necessária; um fragmento de atributos não comprova o formato do feed.',422);
 if(product.relationship==='Parent'||product.relationship==='Child')throw new CatalogError('Famílias Walmart exigem contrato específico; este pacote cobre somente produtos independentes.',422);
 const attributes=listing.attributes,header=attributes.MPItemFeedHeader,orderable=attributes.Orderable,visible=attributes.Visible;
 if(!record(header)||header.feedType!=='MP_ITEM'||header.sellingChannel!=='marketplace'||header.processMode!=='REPLACE'||typeof header.version!=='string'||!header.version||!record(orderable)||!record(visible)||!record(visible[listing.product_type])||Object.keys(visible).length!==1)throw new CatalogError('Informe header, Orderable e Visible conforme a Get Spec desta conta/versão.',422);
 if(orderable.sku!==product.sku||orderable.specProductType!==listing.product_type||product.currency!=='USD'||!isNumericInput(product.price)||Number(product.price)<=0||orderable.price!==Number(product.price))throw new CatalogError('SKU, tipo, preço ou moeda Walmart divergem do catálogo.',422);
 const identifier=orderable.productIdentifiers;
 if(!record(identifier)||!['GTIN','UPC','EAN','ISBN'].includes(identifier.productIdType)||identifier.productId!==product.gtin||!/^\d{8,14}$/.test(String(product.gtin||''))||product._catalog?.facts.gtin?.status!=='confirmed'||hash(product._catalog.facts.gtin.value)!==hash(product.gtin))throw new CatalogError('Identidade Walmart exige GTIN confirmado; isenção Amazon não é reutilizada.',422);
 const payload={MPItemFeedHeader:structuredClone(header),MPItem:[{Orderable:structuredClone(orderable),Visible:structuredClone(visible)}]};
 const issues=validateSchema(spec.schema,payload);if(issues.length)throw new CatalogError('Pacote Walmart incompatível com a Get Spec: '+issues.map(issue=>issue.code).join(', '),422);
 return payload;
}
