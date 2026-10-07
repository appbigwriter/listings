import type {SupabaseClient} from '@supabase/supabase-js';
import {hasCapability,type AuthContext} from '../auth';
import {CatalogError,scopeQuery} from '../catalog/repository';
import type {Channel} from '../catalog/model';

const channels=new Set<Channel>(['amazon-us','ebay-us','walmart-us','tiktok-us']);
const clean=(value:unknown,pattern:RegExp,field:string,max:number)=>{const text=typeof value==='string'?value.trim():'';if(!pattern.test(text)||text.length>max)throw new CatalogError(`${field} inválido.`,422);return text;};
function configuration(value:unknown){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>/secret|token|password|client_secret|refresh/i.test(key)))throw new CatalogError('Configuração contém segredo ou formato inválido; use somente a referência do cofre.',422);
 return value as Record<string,unknown>;
}
export function validateMarketplaceAccount(body:Record<string,unknown>){
 const channel=String(body.channel||'') as Channel;if(!channels.has(channel))throw new CatalogError('Canal de marketplace inválido.',422);
 const status=String(body.status||'configured');if(!['configured','active','degraded','revoked'].includes(status))throw new CatalogError('Status de credencial inválido.',422);
 return {channel,account_id:clean(body.account_id,/^[A-Za-z0-9._:-]+$/,'Identidade da conta',200),marketplace_id:clean(body.marketplace_id,/^[A-Za-z0-9_-]+$/,'Marketplace',100),credential_ref:clean(body.credential_ref,/^[A-Za-z0-9._:/-]+$/,'Referência do cofre',512),status,configuration:configuration(body.configuration||{})};
}
export async function listMarketplaceAccounts(db:SupabaseClient,auth:AuthContext){
 const result=await scopeQuery(db.from('marketplace_accounts').select('id,channel,account_id,marketplace_id,credential_ref,status,configuration,created_at,updated_at').order('updated_at',{ascending:false}),auth);
 if(result.error)throw new CatalogError('Registro de contas indisponível.',503);return result.data;
}
export async function saveMarketplaceAccount(db:SupabaseClient,auth:AuthContext,body:Record<string,unknown>){
 if(!hasCapability(auth,'admin'))throw new CatalogError('Administrador obrigatório para configurar contas.',403);
 const data=validateMarketplaceAccount(body),now=new Date().toISOString();
 const result=await db.from('marketplace_accounts').upsert({...data,owner_id:auth.userId,organization_id:auth.organizationId,updated_at:now},{onConflict:'organization_id,owner_id,channel,account_id,marketplace_id'}).select('id,channel,account_id,marketplace_id,credential_ref,status,configuration,updated_at').single();
 if(result.error)throw new CatalogError('Não foi possível salvar a conta do marketplace.',503);return result.data;
}
