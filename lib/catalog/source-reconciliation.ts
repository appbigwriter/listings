import {normalizeImportedProduct} from './import';
import {hash,TECHNICAL_FIELDS,type ProductInput} from './model';
import {CatalogError} from './repository';
import {recordFieldSource,sourceComparisons,SOURCE_FIELDS} from './field-provenance';
export function reconcileSource(product:ProductInput,actor:string,options:Record<string,unknown>){
 const catalog=product._catalog,update=product.source_update as NonNullable<typeof catalog>['source'];
 if(!catalog||!update?.snapshot||update.hash!==hash(update.snapshot))throw new CatalogError('Não existe snapshot íntegro pendente da fonte.',409);
 const incoming=normalizeImportedProduct(update.snapshot,update.id);
 if(incoming.sku!==product.sku)throw new CatalogError('A identidade do snapshot não corresponde ao SKU.',409);
 const reason=typeof options.reason==='string'?options.reason.trim():'';
 if(!reason||reason.length>2000)throw new CatalogError('Registre o motivo da decisão de reconciliação (até 2.000 caracteres).');
 const selected=options.keep_current===true?[]:options.fields;
 if(!Array.isArray(selected)||options.keep_current!==true&&!selected.length||selected.length>SOURCE_FIELDS.length||selected.some(field=>typeof field!=='string'||!SOURCE_FIELDS.includes(field as typeof SOURCE_FIELDS[number]))||new Set(selected).size!==selected.length)throw new CatalogError('Selecione campos válidos e distintos da fonte.');
 const comparisons=sourceComparisons(product,incoming),retained=comparisons.filter(item=>item.changed&&!selected.includes(item.field)).map(item=>item.field);
 const now=new Date().toISOString(),previous_source_hash=catalog.source?.hash||null;
 for(const field of selected){
  product[field]=incoming[field];
  recordFieldSource(product,field,{authority:'source',source_id:update.id,source_hash:update.hash,actor},now);
  if(TECHNICAL_FIELDS.includes(field as typeof TECHNICAL_FIELDS[number]))catalog.facts[field]={value:product[field],source:update.id,status:'pending',observed_at:now};
 }
 product.source_resolution={decision:options.keep_current===true?'keep_current':'apply_selected',reason,actor,at:now,previous_source_hash,source_hash:update.hash,applied_fields:selected,retained_fields:retained};
 catalog.source=structuredClone(update);delete product.source_update;
 product.human_reviewed=false;
 for(const listing of Object.values(catalog.channels))if(listing){delete listing.approval;delete listing.report;}
 return product;
}
