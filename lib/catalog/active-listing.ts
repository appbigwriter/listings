import type { AuthContext } from '../auth';

export type ActiveListingResult<T = any> = {
  listing: T | null;
  archived: boolean;
  error: unknown;
};

/** Return one listing only when it belongs to the authenticated owner and is active. */
export async function getActiveListing(db: any, auth: AuthContext, sku: string): Promise<ActiveListingResult> {
  const scoped = (table: string) => db.from(table).select('*')
    .eq('sku', sku)
    .eq('organization_id', auth.organizationId)
    .eq('owner_id', auth.userId);
  const active = await scoped('prelistings').neq('status', 'archived').maybeSingle();
  if (active.error || active.data) return { listing: active.data ?? null, archived: false, error: active.error };
  const archived = await db.from('prelistings').select('id,status')
    .eq('sku', sku).eq('organization_id', auth.organizationId).eq('owner_id', auth.userId)
    .eq('status', 'archived').maybeSingle();
  return { listing: null, archived: Boolean(archived.data), error: archived.error };
}

/** Return active SKU keys before querying any dependent resource. */
export async function getActiveListingSkus(db: any, auth: AuthContext): Promise<{ skus: string[]; error: unknown }> {
  const skus:string[]=[];
  for(let offset=0;offset<=5000;offset+=500) {
    const result = await db.from('prelistings').select('sku').eq('organization_id', auth.organizationId).eq('owner_id', auth.userId).neq('status', 'archived').order('sku').range(offset,offset===5000?offset:offset+499);
    if(result.error)return {skus:[],error:result.error};
    if(offset===5000&&(result.data||[]).length)return {skus:[],error:new Error('Catálogo acima de 5.000 SKUs. Refine o escopo.')};
    skus.push(...(result.data??[]).map((row:{sku?:string})=>row.sku).filter((sku:unknown):sku is string=>Boolean(sku)));
    if((result.data||[]).length<500)return {skus,error:null};
  }
  return {skus,error:null};
}

export function archivedListingResponse() {
  return { error: 'Listing arquivado: a operação não é permitida.', code: 'LISTING_ARCHIVED' };
}
