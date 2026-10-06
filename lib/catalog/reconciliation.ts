import { hash } from './model';
export function submissionMatches(payload:{attributes?:Record<string,unknown>}|null,remote:{attributes?:Record<string,unknown>}) {
  const expected=payload?.attributes;
  // Absence or a different response cannot prove a failed send. Keep it blocked for investigation.
  return Boolean(expected && Object.keys(expected).length && remote.attributes && Object.entries(expected).every(([field,value])=>field in remote.attributes! && hash(value)===hash(remote.attributes![field])));
}
/** SKU + marketplace + attributes prove the observed version, never status alone. */
export function amazonListingObservation(payload:{attributes?:Record<string,unknown>}|null,sku:string,marketplaceId:string,remote:any){
 const summaries=Array.isArray(remote?.summaries)?remote.summaries.filter((item:any)=>item?.marketplaceId===marketplaceId):[];
 const matched=Boolean(remote?.sku===sku&&summaries.length&&submissionMatches(payload,remote));
 const blocked=remote?.issues!==undefined&&!Array.isArray(remote.issues)||Array.isArray(remote?.issues)&&remote.issues.some((issue:any)=>issue?.severity==='ERROR');
 const buyable=Boolean(matched&&!blocked&&summaries.some((summary:any)=>Array.isArray(summary.status)&&summary.status.includes('BUYABLE')));
 return {matched,blocked:Boolean(blocked),buyable,verified:matched&&!blocked,status:!matched?'unknown':blocked?'rejected':buyable?'published':'processing'} as const;
}
