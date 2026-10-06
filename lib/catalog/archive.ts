import type {SupabaseClient} from '@supabase/supabase-js';
import {hasCapability,type AuthContext} from '../auth';
import {CatalogError} from './repository';
import type {Database} from '../supabase/database.types';
export async function setArchive(db:SupabaseClient,auth:AuthContext,body:Record<string,unknown>){
 if(!hasCapability(auth,'admin'))throw new CatalogError('Somente administrador pode arquivar ou restaurar produtos.',403);
 if(typeof body.sku!=='string'||body.sku.length>200||!body.sku.trim()||typeof body.expected_version!=='string'||!Number.isFinite(Date.parse(body.expected_version)))throw new CatalogError('SKU e versão revisada são obrigatórios.');
 if(typeof body.archive!=='boolean'||body.confirm!==true||typeof body.reason!=='string'||body.reason.trim().length<5||body.reason.length>1000)throw new CatalogError('Confirme a ação e registre um motivo de 5 a 1.000 caracteres.');
 const args:Database['public']['Functions']['set_catalog_archive']['Args']={p_owner:auth.userId,p_organization:auth.organizationId,p_sku:body.sku.trim(),p_version:body.expected_version,p_archive:body.archive,p_reason:body.reason.trim()};
 const result=await db.rpc('set_catalog_archive',args);
 if(result.error||!result.data)throw new CatalogError('Versão alterada, operação já realizada ou envio ativo/incerto. Recarregue e reconcilie antes de arquivar/restaurar.',409);
 return result.data;
}
