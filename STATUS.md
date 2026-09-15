# STATUS — FBRSigns PreListing + Marketing Readiness

## Estado atual

`IMPLEMENTACAO_LOCAL_COM_BLOQUEIOS_EXTERNOS` | `Product Preparation + Seller Handoff`

A auditoria e o backlog de encerramento estão em:
- `PRD-002-fechamento-fbr-prelisting.md`
- `SPRINTS.md`

## Mini PRDs existentes

| ID | Título | Depende de | Status | Dono provável |
|---|---|---|---|---|
| MP-000 | Fundação do PreListing + Marketing Readiness | nenhum | aprovado | Sergio / David |
| MP-001 | Módulo Marketing Readiness | MP-000 | implementado_verificado* | David / FBR Agency |
| PRD-002 | Auditoria e fechamento do FBR PreListing | MP-000, MP-001 | auditoria_concluida | David |

`*` MP-001 passa nos testes de domínio, mas ainda não possui todos os critérios E2E independentemente verificados.

## Sprints de fechamento

| Sprint | Escopo | Stories | Status |
|---|---|---:|---|
| S0 | Fundação, contratos, auth/RLS e documentação | 3 | concluído localmente* |
| S1 | Catálogo e Amazon Seller Handoff | 7 | concluído localmente* |
| S2 | Marketing Readiness e aprovação | 5 | existente + protegido por middleware* |
| S3 | E2E, deploy e encerramento | 5 | parcial; local-only* |

**Total:** 20 Stories. Detalhamento em `SPRINTS.md`.

## Ordem

```text
S0 Fundação e segurança
  ├── S1 Catálogo e Seller Handoff
  └── S2 Marketing Readiness
          └── S3 E2E, deploy e encerramento
```

## Evidência técnica atual (2026-09-15)

- `npm test -- --run`: 2 arquivos, 10 testes aprovados.
- `npm run typecheck`: aprovado.
- `npm run build`: aprovado; 16 páginas geradas.
- `localhost:3111`: `/`, `/dashboard` e `/marketing` responderam HTTP 200.
- `GET /api/listings`: readback de 1 listing do Supabase.
- `POST /api/kanban` sem confirmação: dry-run com 5 previews e `created:false`.
- `localhost:3100` pertence a outro serviço (Agency Flux); não usar como alvo do PreListing.

## Fluxo e decisões confirmadas

- Meta Ads direcionará inicialmente para a página do produto na Amazon.
- O tracking inicial será baseado em clique de saída; Amazon Attribution será usado quando estiver disponível/elegível.
- A primeira fase atende somente a FBRSigns.
- Cada produto terá sua própria BM/ad account da Meta.
- A margem real será armazenada no perfil de marketing.
- Supabase/Postgres é a persistência oficial.
- Publicação automática em Amazon Ads/Meta/Seller Central não é autorizada por este status; o fechamento proposto é Product Preparation + Seller Handoff.

## Evidência desta execução (2026-09-15)

- `npm test -- --run`: 3 arquivos, 14 testes aprovados.
- `npm run typecheck`: aprovado.
- `npm run build`: aprovado; 18 rotas geradas.
- `git diff --check`: aprovado.
- `supabase-closing-migration.sql`: migration criada com owner/organization, arquivamento, submission, template e RLS fail-closed.
- Rotas de catálogo e handoff exigem `x-user-id`; sem identidade retornam HTTP 401 (`AUTH_REQUIRED`).
- Export Seller Handoff bloqueia dados inválidos com HTTP 422 e registra template/versão/status; não publica.
- `middleware.ts` protege APIs de catálogo/marketing/Kanban; geração/extração permanecem sem autenticação por serem operações sem persistência.

## Blockers verificáveis

1. **Alta — migration/RLS não aplicada remotamente:** nenhuma credencial/serviço remoto foi usado nesta execução. Owner: infra/Sergio; aplicar somente com gate.
2. **Alta — sessão real não configurada:** o middleware exige identidade verificada (`x-user-id` temporariamente como contrato de gateway); não há provedor de login exercitado. Owner: backend/infra.
3. **Média — E2E/restart e deploy público não verificados:** execução ficou local-only; não há alegação de produção. Owner: QA/infra.
4. **Gate de escopo:** publicação automática Amazon, SP-API, anúncios e gasto permanecem explicitamente fora do fechamento.

*`concluído localmente` significa implementado e validado por testes/build; não significa migration aplicada, integração remota ou produção.*
