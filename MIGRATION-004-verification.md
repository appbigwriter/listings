# Aplicação e verificação das migrações — 05/10/2026

## Autorização e alvo

Sergio autorizou nesta conversa a aplicação das duas migrations preparadas. Alvo confirmado pelo `NEXT_PUBLIC_SUPABASE_URL`: projeto **`yigqsjevwvqxrxvqhvtd`**, banco do PreListing. A fonte da loja usa o projeto separado `sssmxxigyipnqcaxpsfx` e não sofreu alteração.

O Supabase MCP executou as migrations remotas, registrando:

| Nome | Arquivo local | Versão registrada no banco |
| --- | --- | --- |
| `catalog_foundation` | `supabase/migrations/20261005165617_catalog_foundation.sql` | `20261005165617` |
| `catalog_pipeline` | `supabase/migrations/20261005165628_catalog_pipeline.sql` | `20261005165628` |
| `catalog_explicit_grants` | `supabase/migrations/20261005165800_catalog_explicit_grants.sql` | `20261005165800` |

O MCP atribuiu as versões ao aplicar. Os arquivos locais foram renomeados para corresponder às três versões verificadas no histórico remoto, mantendo o SQL testado. Não executar os arquivos novamente como migrations novas. A rotina de drift/checks e release permanece em S11-06.

## Preservação e acesso

- `prelistings` tinha **2 registros** antes e continua com **2**.
- Digest dos campos originais, ordenados por ID: `8d05464efef470aeb6504cfc0d13c6b4`, idêntico antes e depois. Nenhum conteúdo original foi reescrito.
- Os 2 registros continuam sem owner/organization e são invisíveis aos escopos de usuários até um mapeamento verificado; nenhum proprietário foi inventado.
- RLS habilitada nas três tabelas do catálogo. Políticas SELECT usam usuário + organização confiável de `app_metadata`, com workspace pessoal como fallback.
- As novas tabelas estão vazias: **0 jobs, 0 submissions**. Não houve importação, geração em lote ou envio de produto.
- `npm run catalog:check` confirmou `catalog_database=accessible` e `jobs_database=accessible` pela Data API do app.

## Complemento de permissões

A inspeção remota encontrou grants padrão `ALL` a `authenticated` nas tabelas novas, incluindo TRUNCATE, apesar de a migration conceder explicitamente apenas SELECT. RLS não protege TRUNCATE. Foi criado pelo CLI e aplicado o complemento `catalog_explicit_grants`, que revoga os grants públicos/padrão para essas tabelas e concede apenas SELECT ao usuário autenticado, preservando escrita do servidor.

Verificação final via `has_table_privilege`:

| Verificação | Resultado |
| --- | --- |
| authenticated SELECT jobs/submissions | true |
| authenticated INSERT jobs | false |
| authenticated UPDATE submissions | false |
| authenticated TRUNCATE jobs/submissions | false |
| anon SELECT jobs | false |
| service_role INSERT jobs | true |

O teste PostgreSQL local agora reproduz grants amplos antes de executar o complemento e verifica que TRUNCATE é negado.

## Pendências descobertas

- **Auth:** 0 usuários em `auth.users`. Criar/validar usuário operacional e sua organização antes de usar o app em produção; não manter `local-only` como autenticação produtiva.
- **Legado:** fornecer mapeamento confiável dos dois registros para owner/org; não usar os UUIDs das fixtures.
- **Marketing:** as seis tabelas antigas não têm owner/org, e o advisor aponta RLS sem políticas. A migração de catálogo não altera essas tabelas. Fechar em S4-05, com preflight e backfill aprovado.
- **Função anterior:** o advisor aponta `public.rls_auto_enable()` SECURITY DEFINER executável por anon/authenticated. Inspecionar finalidade/dependências e restringir execução conforme S4-06; não remover função sem análise. [Advisor 0028](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), [advisor 0029](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).
- **Amazon:** LWA HTTP 400 `invalid_grant`; seguir `AMAZON-API-SETUP.md`.

Não houve deploy, publicação Amazon, alteração de preço/estoque externo, criação de usuários ou backfill de identidade nesta execução. A autorização das migrations não é uma autorização de publicação de listings.
