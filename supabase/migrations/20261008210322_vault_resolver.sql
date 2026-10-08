begin;

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'vault') then
    execute $fn$
      create or replace function public.resolve_vault_secret(p_name text)
      returns text
      language sql
      security definer
      set search_path = vault, public
      stable
      as $body$
        select decrypted_secret
        from vault.decrypted_secrets
        where name = p_name
        limit 1
      $body$
    $fn$;
    execute 'revoke all on function public.resolve_vault_secret(text) from public, anon, authenticated';
    execute 'grant execute on function public.resolve_vault_secret(text) to service_role';
  end if;
end $$;

commit;


