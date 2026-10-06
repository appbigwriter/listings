## Atualização da retomada — 05/10/2026, após 20:10

19 migrations aplicadas/reconciliadas. 177 testes locais em 34 arquivos passaram; typecheck passou. Antimalware privado com receipt e bloqueio em produção sem scanner, condicionais simples eBay e revisão de marketing vinculada à versão foram implementados. Tela de custos/fonte/data e exports coerentes adicionados. Arquivamento/restauração e retomada explícita de lotes implementados; PUT/PATCH Amazon reservam a versão transacionalmente. Readback comprova atributos atuais antes de liberar marketing. Build final passou com 39 rotas. Tipos do schema remoto gerados.

Usuários reais continuam ausentes; Amazon LWA invalid_grant permanece o último diagnóstico de acesso. Nenhum listing/campanha enviado nem infraestrutura criada. Scanner, sessão real, pilotos, deploy, restore e conectores completos continuam pendentes. Estado por story: [EXECUTION-005.md](./EXECUTION-005.md).

# STATUS — FBRSigns PreListing + Marketing Readiness

## Atualização operacional — 05/10/2026

**Estado atual:** `BANCO_CATALOGO_ATIVADO / HOMOLOGACAO_OPERACIONAL_PENDENTE`.

- Aplicadas remotamente as duas migrations do catálogo autorizadas por Sergio e um complemento de grants para efetivar o acesso mínimo previsto; RLS e privilégios verificados. `prelistings`: 2 registros preservados, mesmo digest de conteúdo; 0 jobs e 0 submissions. [Evidências](./MIGRATION-004-verification.md).
- O catálogo e a fila são acessíveis pela Data API do app. Ainda há 0 usuários em Supabase Auth e 2 registros legados sem owner/org; nenhum backfill inventado.
- Amazon: empresa aprovada conforme Sergio; diagnóstico LWA HTTP 400 `invalid_grant`. Precisamos da autorização/token da aplicação correta, não presumir rejeição da empresa. [Guia de APIs e acessos](./AMAZON-API-SETUP.md).
- Pendências de marketing: tabelas antigas sem owner/org; advisor aponta RLS sem políticas e função SECURITY DEFINER anterior executável por anon/authenticated. Planejadas em S4-05/S4-06.
- Novo backlog: [S4–S12, 54 stories](./SPRINTS-004-operacao-completa.md). Catálogo/importação/revisão/worker já implementados; homologação real, produção e fechamento por canal continuam pendentes.
- Nenhum produto publicado, preço/estoque externo alterado, usuário criado, anúncio lançado ou deploy executado nesta rodada. Publicação continua desligada.

As seções abaixo são o histórico da auditoria de setembro; afirmações antigas de migrations não aplicadas ou auth somente por gateway foram substituídas por esta atualização.

## Estado atual

`QA_APROVADO_COM_BLOQUEIOS_EXTERNOS` | `Product Preparation + Seller Handoff`

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

- `npm test -- --run`: 9 arquivos, 56 testes aprovados.
- `npm run typecheck`: aprovado.
- `npm run build`: aprovado; 18 rotas geradas.
- `localhost:3111`: alvo local documentado; nenhum deploy público alegado.
- Smoke negativo desta rodada executado em `localhost:3200` (porta livre): `GET` e `POST /api/extract` sem sessão retornaram HTTP 401; nenhum processo existente foi encerrado.
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

- `npm test -- --run`: 9 arquivos, 56 testes aprovados.
- `npm run typecheck`: aprovado.
- `npm run build`: aprovado; 18 rotas geradas.
- `git diff --check`: aprovado (apenas avisos de conversão LF/CRLF do Git).
- `lib/auth.ts`: adapter fail-closed; `trusted-gateway` valida HMAC e `local-only` exige allow explícito, identidade fixa e não produção. `x-user-id` arbitrário não é aceito.
- `app/dashboard/page.tsx`: busca, filtro, edição, arquivamento, loading, erro, vazio e reload/readback.
- `lib/marketing/contracts.ts` + API de perfil: pacote JSON/Markdown versionado por SKU com produto, economia, canais, tracking, approval e gate.
- `lib/e2e/fixture.ts`, fixture JSON sanitizada e contratos determinísticos cobrem dois SKUs sem segredo e sem Supabase remoto.
- `.env.template`: modo `trusted-gateway` por padrão documental e `local-only` explicitamente restrito a desenvolvimento.
- Nenhuma publicação, gasto, deploy irreversível ou migration remota foi executada.
- Rotas de marketing, approvals, Kanban, Seller Handoff e submissions filtram `owner_id` + `organization_id`; GETs dependentes consultam primeiro o helper de listing ativo e retornam 404/lista vazia para SKU arquivado, sem expor dependências. `marketing-profiles` centraliza listing ativo + decisão mais recente no helper server-side e bloqueia `launch_ready` em POST/PATCH sem gate pronto e decisão exatamente `approved`; rejeição/alterações solicitadas retornam `APPROVAL_NOT_CURRENT`, ausência retorna `APPROVAL_REQUIRED`, sem mutação. Kanban exige que a decisão mais recente (de qualquer tipo) seja `approved`, além de idempotência e readback; Seller Handoff GET é somente leitura.
- Extractor usa `AbortSignal.timeout` até o corpo completo, streaming limitado, redirects manuais, validação DNS e bloqueio de IPv4/IPv6 privado, metadata e IPv4-mapped IPv6; o fetch nativo mantém janela TOCTOU entre resolução e conexão, documentada e mitigável por gateway/proxy com pinning.
- IA usa contrato único estrito `{fbrFacts, referenceData?, fieldId?}`; a UI filtra fatos permitidos, só oferece geração para a whitelist, bloqueia referências concorrentes, preserva provenance/draft/review_required e mantém autenticação fail-closed nas duas rotas.
- `POST /api/extract` agora exige sessão verificável no middleware e no route handler; a UI envia `credentials: include`, e o smoke negativo cobre 401 sem sessão. Não existe exceção pública sem rate limit.
- `lib/marketing/profile-guard.ts` preserva a ordenação descendente e limita o lookup da decisão mais recente a uma linha antes de `maybeSingle`; teste com duas decisões cobre rejeição mais nova sem `PGRST116`.
- `supabase-closing-migration.sql` preflights a existência das sete tabelas antes de qualquer `ALTER TABLE`, lista faltantes em `SAFE_MIGRATION_ABORTED`, verifica NULLs antes de `NOT NULL` e mantém owner-only RLS, archived e unicidade org-scoped sem owner falso.
- Política de isolamento escolhida: owner-only dentro da organização; toda leitura, criação, edição e arquivamento de `prelistings` exige `organization_id` + `owner_id`. SKU pode repetir entre organizações, mas não é compartilhado entre usuários.

## Resultado da QA independente final (2026-09-15)

- **Veredito:** APROVADO COM BLOQUEIOS.
- Nenhuma falha lógica ou vulnerabilidade reproduzível foi encontrada no código atual.
- `npm test -- --run`: 9 arquivos, 56 testes aprovados.
- `npm run typecheck`: aprovado.
- `npm run build`: aprovado; 18 rotas geradas.
- `git diff --check`: aprovado; somente avisos LF/CRLF.
- Smoke em `localhost:3201`: páginas HTTP 200; APIs protegidas sem sessão HTTP 401; extractor para loopback HTTP 400.
- A QA não alterou arquivos, não aplicou migration, não publicou e não executou mutações reais.

## Blockers verificáveis

1. **Alta — migration/RLS não aplicada remotamente:** nenhuma credencial/serviço remoto foi usado nesta execução. Owner: infra/Sergio; aplicar somente com gate.
2. **Alta — provider de sessão real não configurado/exercitado:** o adapter seguro exige `trusted-gateway` com HMAC; `local-only` é somente desenvolvimento e não é produção. Owner: backend/infra.
3. **Média — S1-01/S2 persistência, E2E browser/restart e deploy público não verificados:** APIs dependem de Supabase/provider e a execução permaneceu local-only. Owner: QA/infra.
4. **Gate de escopo:** publicação automática Amazon, SP-API, anúncios e gasto permanecem explicitamente fora do fechamento.
5. **S3-05:** Gate final de Sergio não executado; projeto não está fechado.

*`concluído localmente` significa implementado e validado por testes/build; não significa migration aplicada, integração remota, QA independente ou produção.*

## Execução autônoma S4–S12 — 05/10/2026

Sergio autorizou o início autônomo de todas as sprints. Estado atual e trabalho restante: `EXECUTION-005.md`; acesso/manual: `OPERATIONS-005.md`. Onze migrations adicionais aplicadas, total 14 no histórico remoto, incluindo eventos, recuperação transacional de feeds e reserva eBay. Os dois legados permanecem preservados e sem owner até identificação real. A antiga função RLS não é mais executável por clientes; a nova RPC de sessão retorna somente booleano da própria sessão, com exceção do advisor justificada.

Papéis, logout/refresh/CSRF, limite de JSON, convites/senha, cancelamento, snapshots transacionais, quota/usage IA, DNS fixado, discovery/fees Amazon, pipeline de feed/relatório/monitor, revisão em lote, PATCH de ofertas, diff de fonte e painel operacional foram adicionados. eBay/Walmart têm renovação OAuth e matriz de capacidades; publicação completa desses canais/TikTok continua pendente. Docker/CI preparados, mas daemon Linux parado e nenhum deploy realizado.

Fonte real validada em CLI e navegador: 203 rascunhos válidos, 22 pais, 107 filhos, 74 standalone. Não representa confirmação comercial/física. Não houve importação produtiva com usuário fictício nem envio Amazon. Diagnóstico real permanece `invalid_grant`. Testes locais e build não encerram o piloto/aceite; histórias que precisam de usuários, credenciais, medidas/documentos e destino de infraestrutura estão identificadas no relatório.

Incremento: Storage privado de evidências com versões/hash/recuperação, preparação Inventory/Offer eBay e consultas policies/condições, paginação até 5.000 e benchmark local foram implementados. Nenhum arquivo/listing real enviado; homologações e dependências seguem no relatório.

Incremento seguinte: consumidor de avisos EventBridge→SQS com registro/deduplicação/readback/ack duráveis, template AWS/DLQs e nova tentativa explícita de feed anterior a createFeed foram implementados. Resultado de feed por SKU passa a gravar ledger e projeção na mesma transação. 125 testes locais passam; ativação AWS e homologação real continuam pendentes. Agendamento 20:10 é contingência de retomada, sem interromper nem duplicar implementação em andamento.

Conteúdo en_US específico por canal e executor eBay standalone (conta/policies/Inventory/Offer/publish/readback) adicionados. Famílias eBay, atualização de listings existentes e recuperação sem offerId não estão liberados. Nenhuma publicação real eBay; habilitação depende de acessos/piloto/homologação.
