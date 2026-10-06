/** Account-derived Taxonomy aspects. Unknown formats remain blocked rather than silently accepted. */
export function ebayAspectSchema(result:{aspects?:any[]}) {
 if(!Array.isArray(result.aspects))throw new Error('eBay não retornou os aspectos da categoria.');
 const properties:Record<string,unknown>=Object.create(null),required:string[]=[],allOf:Record<string,unknown>[]=[];
 for(const aspect of result.aspects) {
  const name=aspect.localizedAspectName,constraint=aspect.aspectConstraint;
  if(typeof name!=='string'||!name||!constraint||!['SINGLE','MULTI'].includes(constraint.itemToAspectCardinality)||!['FREE_TEXT','SELECTION_ONLY'].includes(constraint.aspectMode)||typeof constraint.aspectRequired!=='boolean')throw new Error('Contrato de aspecto eBay não reconhecido. Atualize o conector.');
  if(constraint.aspectRequired)required.push(name);
  const values=(aspect.aspectValues||[]).map((value:any)=>value.localizedValue);
  if(values.some((value:unknown)=>typeof value!=='string'))throw new Error('Valores de aspecto eBay inválidos.');
  const items:any={type:'string',minLength:1};
  if(constraint.aspectMode==='SELECTION_ONLY') {if(!values.length)throw new Error('Aspecto de seleção sem valores oficiais.');items.enum=[...new Set(values)];}
  if(constraint.aspectMaxLength!==undefined){if(!Number.isInteger(constraint.aspectMaxLength)||constraint.aspectMaxLength<1)throw new Error('Limite de aspecto eBay inválido.');items.maxLength=constraint.aspectMaxLength;}
  if(constraint.aspectAdvancedDataType){items.not={};items.description='Formato avançado requer adaptação e revisão antes da publicação.';}
  else if(constraint.aspectDataType==='NUMBER')items.format=constraint.aspectFormat==='int32'?'ebay-int32':constraint.aspectFormat==='double'?'ebay-double':'ebay-unsupported';
  else if(constraint.aspectDataType==='DATE')items.format=['YYYY','YYYYMM','YYYYMMDD'].includes(constraint.aspectFormat)?`ebay-date-${constraint.aspectFormat}`:'ebay-unsupported';
  else if(constraint.aspectDataType!=='STRING')items.not={};
  properties[name]={type:'array',minItems:1,maxItems:constraint.itemToAspectCardinality==='SINGLE'?1:30,uniqueItems:true,items};
  for(const value of aspect.aspectValues||[]) {
   const groups=new Map<string,Set<string>>();
   for(const dependency of value.valueConstraints||[]) {
    const control=dependency.applicableForLocalizedAspectName,allowed=dependency.applicableForLocalizedAspectValues;
    if(typeof control!=='string'||!control||!Array.isArray(allowed)||!allowed.length||allowed.some((item:unknown)=>typeof item!=='string'))throw new Error('Dependência de aspecto eBay não reconhecida.');
    const combined=groups.get(control)||new Set<string>();allowed.forEach((item:string)=>combined.add(item));groups.set(control,combined);
   }
   if(groups.size) {
    // A single control follows the documented Taxonomy example. Multiple distinct controls are
    // blocked until their combination semantics can be homologated with a real category.
    const then:Record<string,unknown>=groups.size>1?{not:{}}:{required:[...groups.keys()],properties:Object.fromEntries([...groups].map(([control,allowed])=>[control,{type:'array',contains:{enum:[...allowed]}}]))};
    allOf.push({if:{required:[name],properties:{[name]:{contains:{const:value.localizedValue}}}},then});
   }
  }
 }
 return {type:'object',properties,required,additionalProperties:false,...(allOf.length?{allOf}:{})};
}
