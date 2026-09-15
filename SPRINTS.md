# SPRINTS — Fechamento FBR PreListing

**Fonte:** `PRD-002-fechamento-fbr-prelisting.md`  
**Regra:** cada Story só passa a `concluido` com evidência objetiva. `S0-02` é bloqueador do uso com dados reais. A política de isolamento implementada localmente é owner-only dentro da organização.

## S0 — Fundação, contrato Amazon e segurança

**Objetivo:** tornar seguro e determinístico o núcleo sobre o qual os demais módulos serão fechados.

### S0-01 — Consolidar contratos e estados
- **Owner:** David / executor backend
- **Depende de:** nenhum
- **Ação:** centralizar tipos de listing, status, erros, campos obrigatórios e versão do contrato; remover divergências entre UI, APIs e schemas.
- **Evidência:** diff dos tipos/contratos e testes de validação.
- **Aceite:** o mesmo SKU/status e os mesmos códigos de erro são usados no frontend, APIs e testes; `npm run typecheck` passa.

### S0-02 — Implementar autenticação, autorização e RLS
- **Owner:** executor backend/infra
- **Depende de:** S0-01
- **Ação:** proteger páginas e rotas mutáveis; aplicar RLS por usuário/organização; manter service role somente no servidor; adicionar testes de acesso negado.
- **Evidência:** migration SQL, matriz de permissões, respostas 401/403 e teste negativo entre dois usuários.
- **Aceite:** usuário sem sessão não cria/edita/aprova; usuário A não consulta nem altera SKU de B; nenhum segredo aparece em bundle, HTML ou log.
- **Gate:** segurança antes de dados reais.

### S0-03 — Atualizar documentação e aposentar plano histórico
- **Owner:** David / Kora
- **Depende de:** S0-01
- **Ação:** referenciar PRD-002 como plano de fechamento; marcar `implementation_plan.md` como histórico ou substituí-lo por referência ao fluxo atual; sincronizar `STATUS.md`.
- **Evidência:** documentos e `git diff --check`.
- **Aceite:** não existe documento ativo com pergunta de provedor já resolvida como se estivesse em aberto; STATUS aponta para PRD-002 e SPRINTS.

## S1 — Catálogo de produtos e Amazon Seller Handoff

**Objetivo:** entregar o ciclo completo de preparação, gerenciamento e exportação segura para Seller Central, sem publicação automática.

### S1-01 — CRUD de pré-listings por SKU
- **Owner:** executor backend
- **Depende de:** S0-01, S0-02
- **Ação:** implementar GET/POST/PATCH/DELETE lógico (arquivar) com schema de request/response e conflito de SKU.
- **Evidência:** testes de API com dois SKUs e casos inválidos.
- **Aceite:** criar, editar, listar, abrir e arquivar um SKU; duplicata retorna erro determinístico; SKU de outro usuário retorna 404/403 conforme política.

### S1-02 — Tela de catálogo gerenciável
- **Owner:** executor frontend
- **Depende de:** S1-01
- **Ação:** permitir busca, filtro por status, abrir edição, salvar e arquivar; mostrar loading, erro e estado vazio.
- **Evidência:** smoke browser com fixture `E2E-CATALOG-<run-id>`.
- **Aceite:** após salvar e recarregar, os valores permanecem; arquivar remove da lista ativa sem apagar o histórico.

### S1-03 — Modelo Amazon por categoria e variantes
- **Owner:** executor Amazon/catalog
- **Depende de:** S0-01
- **Ação:** criar catálogo versionado de templates mínimos e validar Parent/Child, SKU, ASIN/GTIN/isencao, atributos, dimensões embaladas, peso, origem, compliance e fulfillment.
- **Evidência:** fixture de uma categoria FBRSigns e saída de validação.
- **Aceite:** categoria/template/versão são obrigatórios; dimensões e peso da embalagem não podem ser omitidos; variante Child possui identidade própria.

### S1-04 — Geração IA segura e orientada à Amazon US
- **Owner:** executor AI/frontend
- **Depende de:** S0-01
- **Ação:** explicitar idioma Amazon US, limitar claims a fatos fornecidos, registrar origem e exigir revisão antes de exportar.
- **Evidência:** teste com texto de concorrente e saída marcada como rascunho.
- **Aceite:** output não copia marca/review/claim do concorrente; idioma alvo é explícito; conteúdo não aprovado não pode ser marcado como pronto.

### S1-05 — Extração e proveniência de referência
- **Owner:** executor backend
- **Depende de:** S0-01
- **Ação:** persistir URL/plataforma/timestamp/snapshot e diferenciar referência de fato FBRSigns; tratar bloqueio HTTP, HTML inválido e limite de bytes.
- **Evidência:** testes 200, 4xx/5xx, interstitial Amazon e entrada colada.
- **Aceite:** falhas são mensagens acionáveis; cada campo derivado tem provenance; nenhum dado externo entra como claim aprovado automaticamente.

### S1-06 — Exportador Seller Handoff versionado
- **Owner:** executor Amazon/catalog
- **Depende de:** S1-01, S1-03, S1-04
- **Ação:** gerar CSV e JSON por SKU com template, versão, timestamp, status e checklist; bloquear export quando campos obrigatórios falharem.
- **Evidência:** arquivos gerados para fixture e validação de schema.
- **Aceite:** export válido contém os campos do template selecionado; export inválido retorna lista de erros; arquivo não é chamado apenas de `final` e é rastreável por versão.

### S1-07 — Registro do resultado de submissão manual
- **Owner:** executor frontend/backend
- **Depende de:** S1-06
- **Ação:** permitir registrar arquivo/protocolo, data, status (`not_submitted`, `submitted`, `processing`, `accepted`, `rejected`) e motivo do Seller Central; não simular publicação.
- **Evidência:** criação, atualização e readback do registro.
- **Aceite:** o usuário distingue exportado de submetido, aceito e publicado; rejeição guarda motivo; nenhum status externo é inventado.

## S2 — Marketing Readiness e aprovação

**Objetivo:** fechar o módulo MP-001 como preparação revisável e auditável por SKU.

### S2-01 — Perfil e economia por SKU
- **Owner:** executor marketing/backend
- **Depende de:** S1-01, S0-02
- **Ação:** criar/editar perfil, custos e margem; rejeitar custo ausente e separar dados por SKU.
- **Evidência:** API + readback após reload com dois SKUs.
- **Aceite:** exemplo 249 USD retorna custo 153.35, lucro 95.65 e margem 38.41%; custo ausente bloqueia sem assumir zero.

### S2-02 — Planos Amazon PPC, Meta e Tracking
- **Owner:** executor marketing
- **Depende de:** S2-01
- **Ação:** persistir rascunhos com cinco estruturas PPC, BM/ad account por produto, destino Amazon, UTMs, `OutboundClick` e Attribution `pending`.
- **Evidência:** endpoints POST/GET e JSON persistido.
- **Aceite:** nenhum plano contém publicação/gasto; Meta não declara `Purchase`; dados de SKU A não aparecem em SKU B.

### S2-03 — Launch Gate e aprovação auditável
- **Owner:** executor marketing/backend
- **Depende de:** S2-01, S2-02, S0-02
- **Ação:** expor blockers, registrar aprovação/rejeição/alterações solicitadas, aprovador, comentário e timestamp; atualizar status apenas conforme Gate.
- **Evidência:** aprovação válida e tentativa inválida com readback.
- **Aceite:** aprovação é bloqueada sem preço, estoque, imagem, oferta/ASIN ou margem; decisão aprovada só vira `launch_ready` quando gate está pronto; reload conserva histórico.
- **Gate:** aprovação humana de Sergio é necessária para qualquer publicação/gasto posterior.

### S2-04 — Pacote de marketing por SKU
- **Owner:** executor marketing/frontend
- **Depende de:** S2-02, S2-03
- **Ação:** exportar JSON e Markdown contendo produto, economia, canais, tracking, provenance, status e aprovação.
- **Evidência:** pacote inspecionado e identificado por SKU/versão.
- **Aceite:** os quatro blocos existem; export de SKU A não contém dados de B; plano criado, aprovado e publicado aparecem como estados distintos.

### S2-05 — Handoff Kanban com dry-run e confirmação
- **Owner:** executor marketing/Flux
- **Depende de:** S2-02
- **Ação:** manter preview padrão e exigir confirmação explícita para criar os cinco cards; guardar IDs e status retornados.
- **Evidência:** dry-run sem mutação e criação autorizada com readback.
- **Aceite:** sem `confirm:true`, resposta é `created:false` e cinco previews; com confirmação autorizada, cinco tarefas são lidas de volta e vinculadas ao SKU.

## S3 — E2E, deploy e encerramento

**Objetivo:** provar o fluxo completo no ambiente declarado e encerrar sem alegações não verificadas.

### S3-01 — Fixture E2E isolada e limpeza segura
- **Owner:** executor QA
- **Depende de:** S0-02, S1-01
- **Ação:** criar fixture única `FBR-E2E-<run-id>`, com dois SKUs e usuário de teste; limpar somente IDs criados pela execução.
- **Evidência:** script/relatório com IDs, sem secrets.
- **Aceite:** execução repetida não mistura dados nem remove produto oficial; falha preserva recursos para diagnóstico.

### S3-02 — Fluxo E2E pela interface
- **Owner:** executor QA/frontend
- **Depende de:** S1-02, S1-06, S2-03, S3-01
- **Ação:** exercitar criar → editar → validar → exportar → criar perfil → gerar planos → reprovar/aprovar → recarregar → reiniciar → ler de volta.
- **Evidência:** relatório com URLs, status HTTP, screenshots/logs sanitizados e readbacks.
- **Aceite:** fluxo válido completa; casos inválidos exibem blockers; decisões e dados sobrevivem reload/restart; isolamento entre dois SKUs é comprovado.

### S3-03 — Regressão automatizada de contrato
- **Owner:** executor QA
- **Depende de:** S1-01, S1-06, S2-03
- **Ação:** ampliar testes unitários/API para erros, autorização, export, status e idempotência.
- **Evidência:** `npm test -- --run` e relatório de cobertura/rotas.
- **Aceite:** testes passam sem mocks que ocultem persistência; cada critério crítico tem teste positivo e negativo.

### S3-04 — Deploy reproduzível e health/readback
- **Owner:** executor infra
- **Depende de:** S0-02, S3-03
- **Ação:** documentar build/start, variáveis por referência, health check, commit implantado e rollback; não expor secrets.
- **Evidência:** alvo (staging ou local-only) responde e commit é conferido.
- **Aceite:** se houver deploy, URL e readback são registrados; se não houver, o projeto é marcado explicitamente como local-only, sem alegação de produção.

### S3-05 — Gate final e fechamento
- **Owner:** Sergio / David
- **Depende de:** todos S0–S3 anteriores
- **Ação:** comparar PRD, STATUS, evidências, riscos e non-goals; registrar decisão final e versão de encerramento.
- **Evidência:** checklist DoD assinado/confirmado e `STATUS.md` atualizado.
- **Aceite:** nenhum Story fica sem evidência; blockers abertos têm owner e plano; status final só é `concluido` após Gate explícito de Sergio.

## Quadro de execução

| Sprint | Stories | Estado inicial | Saída |
|---|---:|---|---|
| S0 | 3 | pendente | núcleo seguro e contratos consolidados |
| S1 | 7 | pendente | catálogo e Seller Handoff operacional |
| S2 | 5 | pendente | Marketing Readiness auditável |
| S3 | 5 | pendente | E2E e encerramento comprovados |

## Registro desta execução

- **S0-01 concluído localmente:** `lib/catalog/contracts.ts`, `lib/catalog/submission.ts` e `tests/closing-domain.test.ts`; contratos de status, template, validação e erros cobertos.
- **S0-02 parcial/bloqueado externamente:** `lib/auth.ts` usa adapter fail-closed: `trusted-gateway` exige HMAC e `local-only` exige allow explícito, identidade fixa e não produção; `x-user-id` arbitrário não é aceito. APIs de catálogo e o extractor aplicam autenticação/owner + organização; a migration/RLS owner-only está validada estaticamente, mas `supabase-closing-migration.sql` não foi aplicada.
- **S0-03 concluído:** `implementation_plan.md` marcado como histórico e aponta para PRD-002/SPRINTS.
- **S1-01 parcial:** CRUD HTTP de catálogo em `app/api/listings/route.ts`, com PATCH e arquivamento lógico; todas as operações aplicam owner + organização. Persistência depende de Supabase/RLS e sessão verificável.
- **S1-02 concluído localmente:** `app/dashboard/page.tsx` tem busca, filtro, edição, arquivamento, loading, erro, vazio e reload/readback por API.
- **S1-03/S1-06 concluídos localmente:** template versionado e Seller Handoff JSON/CSV determinístico em `lib/catalog/contracts.ts` e `app/api/seller-handoff/route.ts`; export inválido retorna `422`.
- **S1-07 concluído localmente:** registro/readback de resultado manual em `app/api/seller-submission/route.ts`; status de publicação permanece `not_published`.
- **S2-01–S2-03 protegidos localmente:** perfil, margem obrigatória, planos draft, Launch Gate e approval filtram owner/organização; `lib/marketing/profile-guard.ts` centraliza listing ativo e a decisão mais recente com `order` descendente + `.limit(1)` + `maybeSingle`, coberto por teste com múltiplas decisões; POST/PATCH de perfil só aceitam `launch_ready` com gate pronto e decisão exatamente `approved`, retornando `APPROVAL_REQUIRED`/`APPROVAL_NOT_CURRENT` sem mutação; aprovador vem da identidade autenticada, sem publicação/gasto.
- **S2-04 concluído localmente:** `lib/marketing/contracts.ts` e `GET /api/marketing-profiles?sku=...&format=json|markdown` produzem pacote versionado com produto, economia, canais, tracking, approval e gate.
- **S2-05 concluído localmente:** Kanban mantém dry-run, exige gate/aprovação, usa idempotência e readback; criação externa não foi exercitada.
- **S3-01/S3-03 concluídos localmente:** `lib/e2e/fixture.ts`, `tests/fixtures/e2e-sanitized.json`, `tests/prd002-contracts.test.ts`, `tests/qa-regressions.test.ts` e `tests/ai-ui-contract.test.ts` cobrem fixture sanitizada, isolamento owner-only, auth fail-closed incluindo `/api/extract`, pacote, SSRF, dry-run, contrato UI/API de IA, múltiplas approvals e ordem estática do preflight da migration sem Supabase remoto.
- **S3-02 parcial/bloqueado:** fluxo browser/restart/readback dependem de provider e Supabase configurados; não foi alegado QA independente.
- **S3-04 concluído como documentação local-only:** `.env.template` declara `trusted-gateway` ou `local-only` explícito; nenhum deploy público foi executado.
- **S3-05 não concluído:** Gate final de Sergio e encerramento continuam pendentes.

Evidências executadas nesta execução: `npm test -- --run` (9 arquivos/56 testes), `npm run typecheck`, `npm run build`, `git diff --check` e smoke negativo em `localhost:3200` (`GET`/`POST /api/extract` sem sessão retornaram HTTP 401); nenhuma publicação, gasto, deploy irreversível ou migration remota foi executada.

As correções desta rodada cobrem timeout durante todo o body e mapped IPv6 do extractor (com limitação TOCTOU do fetch nativo documentada), bloqueio explícito de operações sobre listings arquivados, seleção da decisão mais recente de qualquer tipo (somente `approved` permite Kanban) e auth real do adapter nas duas rotas de IA. A verificação remota de sessão, RLS/migration, restart/readback e deploy público continua bloqueada por configuração/credenciais externas. S3-05 permanece pendente.

**Status do fechamento:** implementação local ampliada; não marcar `concluido` antes dos blockers e do Gate final de Sergio.

**Total:** 20 Stories. Nenhuma publicação Amazon, alteração de preço, gasto de mídia, migração produtiva ou deploy irreversível está autorizada por este backlog sem Gate específico.
