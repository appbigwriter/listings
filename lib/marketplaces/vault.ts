import type { SupabaseClient } from '@supabase/supabase-js';
import { CatalogError } from '../catalog/repository';

export function vaultSecretName(reference: string) {
  const value = reference.trim();
  if (!/^vault:\/\/[A-Za-z0-9._:/-]+$/.test(value)) throw new CatalogError('Referência de cofre inválida.', 422);
  return value.slice('vault://'.length);
}

export async function resolveVaultSecret(db: SupabaseClient, reference: string) {
  const name = vaultSecretName(reference);
  const result = await db.rpc('resolve_vault_secret', { p_name: name });
  if (result.error) throw new CatalogError('Cofre de segredos indisponível.', 503);
  if (typeof result.data !== 'string' || !result.data) throw new CatalogError('Segredo referenciado não foi encontrado no cofre.', 503);
  return result.data;
}
