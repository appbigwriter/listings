import {hash,TECHNICAL_FIELDS,type ProductInput} from './model';
export const SOURCE_FIELDS=['title','description','images','price','qty','shipping_charge','currency',...TECHNICAL_FIELDS] as const;
export function recordFieldSource(product:ProductInput,field:string,source:{authority:'source'|'human';source_id?:string;source_hash?:string;actor?:string},observed_at=new Date().toISOString()){
 if(!product._catalog)throw new Error('Catálogo ausente para provenance.');
 product._catalog.field_sources||={};
 product._catalog.field_sources[field]={...source,observed_at,value_hash:hash(product[field])};
}
export function sourceComparisons(product:ProductInput,incoming:ProductInput){
 return SOURCE_FIELDS.map(field=>({field,current:product[field]??null,incoming:incoming[field]??null,changed:hash(product[field])!==hash(incoming[field]),provenance:product._catalog?.field_sources?.[field]||null}));
}
