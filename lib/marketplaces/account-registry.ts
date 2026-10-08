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
 const result=await scopeQuery(db.from('marketplace_accounts').select('id,channel,account_id,marketplace_id,credential_ref,status,credential_state,writes_blocked_until,last_checked_at,configuration,created_at,updated_at').order('updated_at',{ascending:false}),auth);
 if(result.error)throw new CatalogError('Registro de contas indisponível.',503);return result.data;
}
export async function saveMarketplaceAccount(db:SupabaseClient,auth:AuthContext,body:Record<string,unknown>){
 if(!hasCapability(auth,'admin'))throw new CatalogError('Administrador obrigatório para configurar contas.',403);
 const data=validateMarketplaceAccount(body),now=new Date().toISOString();
 const result=await db.from('marketplace_accounts').upsert({...data,owner_id:auth.userId,organization_id:auth.organizationId,updated_at:now},{onConflict:'organization_id,owner_id,channel,account_id,marketplace_id'}).select('id,channel,account_id,marketplace_id,credential_ref,status,credential_state,writes_blocked_until,last_checked_at,configuration,updated_at').single();
 if(result.error)throw new CatalogError('Não foi possível salvar a conta do marketplace.',503);return result.data;
}

export const CREDENTIAL_CODES = ['token_invalid','refresh_failed','insufficient_scope','rate_limited','revoked','provider_unavailable'] as const;
export type CredentialCode = typeof CREDENTIAL_CODES[number];
export async function recordCredentialIncident(db:SupabaseClient, auth:AuthContext, accountId:string, code:CredentialCode, message:string, evidence:Record<string,unknown> = {}) {
 const account=await scopeQuery(db.from('marketplace_accounts').select('id').eq('id',accountId).maybeSingle(),auth);
 if(account.error)throw new CatalogError('Conta de marketplace indisponível.',503); if(!account.data)throw new CatalogError('Conta de marketplace não encontrada.',404);
 const now=new Date().toISOString();
 const updated=await scopeQuery(db.from('marketplace_accounts').update({credential_state:code==='rate_limited'?'rate_limited':code==='insufficient_scope'?'insufficient_scope':code==='revoked'?'revoked':code==='token_invalid'?'invalid':'refresh_required',status:code==='revoked'?'revoked':'degraded',writes_blocked_until:code==='rate_limited'?new Date(Date.now()+15*60_000).toISOString():null,last_checked_at:now,updated_at:now}),auth).eq('id',accountId).select('id,credential_state,status,writes_blocked_until').single();
 if(updated.error)throw new CatalogError('Falha ao bloquear writes da conta.',503);
 const incident=await db.from('marketplace_credential_incidents').upsert({owner_id:auth.userId,organization_id:auth.organizationId,marketplace_account_id:accountId,code,status:'open',message,evidence,last_seen_at:now,updated_at:now},{onConflict:'organization_id,owner_id,marketplace_account_id,code,status'}).select('*').single();
 if(incident.error)throw new CatalogError('Falha ao registrar incidente de credencial.',503); return {account:updated.data,incident:incident.data};
}
