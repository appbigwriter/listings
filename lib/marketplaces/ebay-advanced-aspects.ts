import {ebayAspectSchema} from './ebay-schema';
import {validateSchema} from '../catalog/schema';
import type {Issue} from '../catalog/model';

export type EbayAspectConstraint = {aspectRequired:boolean;aspectMode:'FREE_TEXT'|'SELECTION_ONLY';itemToAspectCardinality:'SINGLE'|'MULTI';aspectDataType:string;aspectEnabledForVariations?:boolean;aspectFormat?:string;aspectMaxLength?:number;aspectAdvancedDataType?:string};
export type EbayTaxonomyAspect = {localizedAspectName:string;aspectConstraint:EbayAspectConstraint;aspectValues?:{localizedValue:string;valueConstraints?:{applicableForLocalizedAspectName:string;applicableForLocalizedAspectValues:string[]}[]}[]};
export type EbayTaxonomyAspects = {aspects:EbayTaxonomyAspect[]};
const rangePattern='^(?:0|[1-9][0-9]{0,2})(?:\\.[0-9])?-(?:0|[1-9][0-9]{0,2})(?:\\.[0-9])?$';

/** Only the documented en-US CCD range grammar is supported; generic ranges remain blocked. */
export function ebayAdvancedAspectSchema(taxonomy:EbayTaxonomyAspects) {
  if(!Array.isArray(taxonomy.aspects)||new Set(taxonomy.aspects.map(aspect=>aspect.localizedAspectName)).size!==taxonomy.aspects.length)throw new Error('Contrato eBay com aspectos ausentes ou duplicados.');
  const copy=structuredClone(taxonomy);
  for(const aspect of copy.aspects) {
    if(aspect.localizedAspectName==='Device Charging Range'&&aspect.aspectConstraint.aspectAdvancedDataType==='NUMERIC_RANGE') {
      delete aspect.aspectConstraint.aspectAdvancedDataType;
      aspect.aspectConstraint.aspectDataType='STRING';
    }
  }
  const schema=ebayAspectSchema(copy);
  const properties=schema.properties as Record<string,{items:Record<string,unknown>}>;
  for(const aspect of taxonomy.aspects)if(aspect.localizedAspectName==='Device Charging Range'&&aspect.aspectConstraint.aspectAdvancedDataType==='NUMERIC_RANGE')properties[aspect.localizedAspectName].items.pattern=rangePattern;
  return schema;
}

export function validateEbayAdvancedAspects(taxonomy:EbayTaxonomyAspects,attributes:Record<string,unknown>):Issue[] {
  const issues=validateSchema(ebayAdvancedAspectSchema(taxonomy),attributes);
  for(const aspect of taxonomy.aspects) {
    const values=attributes[aspect.localizedAspectName];
    if(aspect.localizedAspectName==='Device Charging Range'&&aspect.aspectConstraint.aspectAdvancedDataType==='NUMERIC_RANGE'&&Array.isArray(values)) {
      for(const value of values)if(typeof value==='string'&&new RegExp(rangePattern).test(value)) {
        const [min,max]=value.split('-').map(Number);
        if(min>max)issues.push({code:'ebay_range_order',field:aspect.localizedAspectName,message:'O mínimo do intervalo excede o máximo.',severity:'error',action:'Confira a medição e corrija o intervalo.'});
      }
    }
    for(const option of aspect.aspectValues||[])if(Array.isArray(values)&&values.includes(option.localizedValue)) {
      const controllers=new Set((option.valueConstraints||[]).map(value=>value.applicableForLocalizedAspectName));
      if(controllers.size>1)issues.push({code:'ebay_multiple_controls_unsupported',field:aspect.localizedAspectName,message:'A combinação de controladores precisa de contrato oficial específico.',severity:'error',action:'Não publicar este valor até validar a semântica do contrato.'});
      for(const controller of controllers)if(!taxonomy.aspects.some(value=>value.localizedAspectName===controller))issues.push({code:'ebay_control_contract_missing',field:controller,message:'Controlador não consta do contrato da categoria.',severity:'error',action:'Recarregue o contrato oficial completo.'});
    }
  }
  return issues;
}
