import type {AiGenerationInput} from './contracts';

export function validGrounding(audit:unknown,input:AiGenerationInput):boolean {
 if(!audit||typeof audit!=='object'||Array.isArray(audit))return false;
 const value=audit as Record<string,unknown>;
 return value.supported===true&&typeof value.reason==='string'&&Array.isArray(value.evidence)&&value.evidence.length>0&&value.evidence.length<=100&&value.evidence.every(entry=>{
  if(!entry||typeof entry!=='object'||Array.isArray(entry))return false;
  const {field,quote}=entry as Record<string,unknown>;
  return typeof field==='string'&&Object.hasOwn(input.fbrFacts,field)&&typeof quote==='string'&&quote.trim().length>0&&typeof input.fbrFacts[field]==='string'&&(input.fbrFacts[field] as string).includes(quote);
 });
}
