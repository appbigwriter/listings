# PRD-002 — Fechamento do Projeto FBR PreListing

## Status
`QA_APROVADO_COM_BLOQUEIOS_EXTERNOS` | `S3-05_PENDENTE`

## Data e escopo da auditoria
- Data: 2026-09-15.
- Repositório auditado: `F:/Projetos/FBRSigns-web/PreListing`.
- Branch/commit atual verificado: `main` / `33747c7` (sincronizado com `origin/main`).
- Alvo local: aplicação Next.js iniciada em `localhost:3111`; o QA final usou `localhost:3201`.
- Smoke negativo final: `localhost:3201`; páginas HTTP 200, APIs protegidas HTTP 401 e extractor para loopback HTTP 400. Nenhum processo existente foi encerrado.
- Não foi alegado deploy público; estado remoto/publicação permanece não verificado.

## Veredito executivo

### 1. Atende às necessidades de listar e gerenciar produtos para Amazon Seller?
**Parcialmente.**

O sistema atende hoje a preparação interna de um pré-listing: formulário, geração assistida autenticada, extração de referência, salvamento no Supabase, consulta do catálogo, arquivamento seguro e exportação de CSV/JSON. Ele não atende ainda ao significado completo de "listar e gerenciar produtos no Amazon Seller": não há integração com Amazon Selling Partner API/Seller Central, importação do resultado da submissão, sincronização de estados e confirmação de que o CSV é o template correto da categoria. Autenticação server-side e filtros owner/organização existem localmente via adapter, mas sessão real, RLS/migration e persistência remota ainda não foram verificados.

A decisão de fechamento deste PRD é: **fechar a versão operacional como Product Preparation + Seller Handoff**, sem publicação automática. Publicação/sincronização automática fica explicitamente fora desta versão, salvo novo Gate de escopo e integração aprovado por Sergio.

### 2. Todos os PRDs estão completos?
**Não.**

- `MP-000-foundation.md`: aprovado e implementado como fundação documental; ainda contém a ressalva de que autenticação/RLS precisa ser configurada antes de dados reais.
- `MP-001-marketing-readiness.md`: implementado e com testes de domínio passando, mas seus critérios de aceite de persistência, isolamento entre SKUs, exportação completa e E2E não estão todos independentemente verificados.
- `implementation_plan.md`: documento histórico de geração por IA; a pergunta de provedor ficou desatualizada, pois o código já usa OpenAI. Não é um PRD executável de fechamento e precisa ser substituído/arquivado.
- Este documento cria o backlog restante para fechar o projeto, não declara os PRDs anteriores concluídos retroativamente.

### 3. A simulação E2E pretendida está funcional?
**Parcialmente funcional, não aceita como E2E fechado.**

Há evidência de interface local, leitura de um registro real do Supabase e Kanban dry-run. Os testes automatizados cobrem domínio, mas não comprovam o fluxo completo pela interface com criação, reload/restart, aprovação, isolamento, exportação e readback independente. A porta 3100 estava ocupada por outro serviço (Agency Flux); o alvo correto do projeto foi validado em 3111. Isso é conflito de ambiente, não falha do build do PreListing.

## Evidências verificadas

| Evidência | Resultado | Classificação |
|---|---|---|
| `npm test -- --run` | 9 arquivos, 56 testes aprovados, incluindo contrato UI/API IA, autenticação fail-closed do extractor, aprovação mais recente limitada a uma linha e preflight da migration | verificado localmente nesta execução |
| `npm run typecheck` | sem erros | verificado localmente |
| `npm run build` | build Next.js concluído, 18 rotas geradas | verificado localmente |
| `GET /`, `/dashboard`, `/marketing` em 3111 | HTTP 200 | verificado localmente |
| `GET /api/listings` em 3111 | retornou 1 listing real do Supabase | verificado localmente / readback local |
| `POST /api/kanban` sem `confirm=true` | dry-run, 5 cards, `created:false` | verificado localmente |
| smoke negativo local sem sessão | marketing/catalog/approval/Kanban/handoff/submission retornaram HTTP 401; extractor loopback retornou HTTP 400 | verificado localmente nesta execução |
| `POST /api/listings` com SKU/título vazios | HTTP 400 e mensagem de validação | verificado localmente |
| `GET /api/marketing-profiles` em 3111 | HTTP 200, lista vazia | verificado localmente |
| deploy público, autenticação, migration no Supabase, restart/redeploy e readback externo | não executados nesta auditoria | não verificado |

## Inventário atual por capacidade

| Capacidade | Status | Evidência | Limitação atual | Próxima ação |
|---|---|---|---|---|
| Criar pré-listing | implementado localmente | `app/page.tsx`, `POST /api/listings` | validação própria e auth adapter; sessão real/RLS/migration remota não verificados | S1-01, S1-02 |
| Consultar catálogo | implementado | `app/dashboard/page.tsx`, `GET /api/listings` | sem paginação/edição/exclusão formal | S1-03 |
| Persistência | parcialmente verificado | Supabase devolveu listing real | schema e credencial service-role no servidor; RLS/auth são ressalva aberta | S0-02, S3-01 |
| Geração por IA | implementado localmente como draft factual | `/api/generate`, `/api/generate-field`, contrato estrito e provenance | provider real não foi exercitado; revisão humana continua obrigatória | S1-04 |
| Extração de referência | implementado | `/api/extract` | dependente da disponibilidade da página; não é fonte autorizada para claims | S1-05 |
| CSV Amazon | implementado como base | exportação em `app/page.tsx` | não usa template de categoria nem valida todos os atributos/valores aceitos pelo Seller Central | S1-06, S1-07 |
| JSON | implementado | exportação local | não contém pacote unificado de produto + economia + canais + tracking | S2-04 |
| Marketing Readiness | parcialmente implementado | `MP-001`, APIs e telas de marketing | perfil real não foi criado/verificado no E2E; exportação Markdown não comprovada | S2-01 a S2-05 |
| Margem real | implementado no domínio | `lib/marketing/margin.ts`, testes | depende de custos completos fornecidos; não há UX de cadastro/edição comprovada | S2-01 |
| Launch Gate/aprovação | implementado no código e protegido contra bypass local | `marketing-approvals`, `marketing-profiles`, `lib/marketing/profile-guard.ts`, testes unitários | não há teste E2E de aprovação persistida e reload; sem usuário autenticado | S2-03, S3-02 |
| Planos Amazon/Meta/tracking | implementado como rascunho | `lib/marketing/plans.ts`, APIs | não publica e não deve publicar; aprovação ≠ publicação | S2-02, S2-04 |
| Kanban | implementado como dry-run | `POST /api/kanban` retornou 5 previews | criação real não foi exercitada; integração externa não verificada | S2-05, S3-03 |
| Segurança | parcial, bloqueio de fechamento | auth fail-closed, filtros owner+organização e migration/RLS owner-only validados localmente | migration remota, provider real e E2E ainda não verificados | S0-02, S3-01 |
| Deploy/observabilidade | não verificado | nenhum artefato de deploy/readback no repositório | não há prova de ambiente público, health check ou rollback | S3-04, S3-05 |

## Requisitos de fechamento

### Funcionais
1. Usuário autenticado consegue criar, listar, abrir, editar e arquivar pré-listings por SKU.
2. Cada produto tem identidade, atributos, oferta, logística, mídia, compliance e status auditáveis.
3. O sistema valida os campos necessários para gerar um arquivo Amazon Seller compatível com um template de categoria selecionado.
4. O sistema exporta CSV e JSON; o CSV registra template, versão, data e SKU.
5. O sistema preserva origem, timestamp e revisão humana de dados derivados de referência/IA.
6. O perfil de marketing calcula margem somente com custos completos e mantém dados isolados por SKU.
7. Planos Amazon PPC, Meta Ads e Tracking são rascunhos revisáveis; nenhum endpoint publica ou gasta.
8. Launch Gate bloqueia aprovação quando faltam oferta, estoque, imagem principal, ASIN/identidade e margem real.
9. Aprovação humana registrada tem aprovador, comentário, timestamp e readback após reload.
10. O fluxo E2E usa fixture descartável, executa ações válidas e inválidas, reinicia o servidor e comprova persistência/readback.

### Não funcionais
- Auth e autorização server-side; service role nunca chega ao browser.
- RLS ou equivalente no Supabase, com isolamento por usuário/organização.
- Erros explícitos, sem assumir custo zero, estoque zero ou aprovação implícita.
- Dados de concorrentes não podem virar claims FBRSigns automaticamente.
- Nenhuma credencial é registrada em logs, testes, PRDs ou exports.
- Build, testes e typecheck devem passar no CI.

## Gaps com causa, impacto, solução, tarefas e aceite

| Gap | Causa verificável | Impacto | Solução | Tarefas | Aceite de fechamento |
|---|---|---|---|---|---|
| Gestão de catálogo incompleta | `listings` possui apenas `POST` e `GET`; não há ciclo arquivar/editar formal | produto não tem ciclo operacional completo | definir CRUD seguro e status de catálogo | S1-01 a S1-03 | dois SKUs podem ser criados, editados, consultados e arquivados sem misturar dados |
| CSV não é garantia de importação Seller | UI chama arquivo de "base" e não seleciona template/versão de categoria | upload pode falhar ou mapear campos incorretamente | catálogo de templates versionados + validação antes do export | S1-06, S1-07 | fixture exporta template declarado, erros bloqueiam export e metadados acompanham arquivo |
| Amazon Seller não está integrado | não existem SP-API client, credenciais, feed submission ou result readback | não é possível afirmar publicação/sincronização | fechar como handoff manual nesta versão e implementar importação de resultado; SP-API é backlog separado | S1-07, S3-05 | usuário baixa arquivo, registra protocolo/resultado e vê status local; nenhuma publicação automática é alegada |
| Segurança não fecha | `supabase-schema.sql` diz "configure RLS/auth" e rotas usam service role | risco de acesso e alteração indevida | autenticação, autorização, RLS e testes negativos | S0-02, S3-01 | usuário A não lê/altera SKU de usuário B; service role não aparece em HTML/JS/log |
| Marketing E2E não comprovado | existem testes unitários e APIs, mas não fixture persistida/readback pela UI | aprovação e planos podem parecer prontos sem prova operacional | fixture E2E isolada, fluxo real, reload/restart e readback | S2-05, S3-02 | perfil, plano, aprovação e status sobrevivem reload/restart e são lidos novamente |
| Exportação de pacote incompleta | UI principal exporta form; marketing client não prova JSON/Markdown consolidado | handoff para operação perde contexto | endpoint/ação de export por SKU com produto, margem, planos, tracking e evidência | S2-04 | pacote contém os quatro blocos e versão; reimportação/inspeção confirma SKU |
| IA e idioma/claims | prompt permite saída em inglês, mas fixture contém descrição em português e dados de concorrente | risco de listing inadequado e claims indevidos | idioma Amazon US explícito, provenance e checklist de revisão | S1-04, S1-05 | saída marca idioma, fonte e revisão; claims sem fonte ficam pendentes |
| Deploy desconhecido | não há URL/commit/deploy/readback documentados | projeto pode estar só local | pipeline, health, configuração por referência e readback | S3-04, S3-05 | alvo declarado responde, commit é conferido e smoke E2E é anexado |

## Arquitetura alvo de fechamento

- Next.js 15 + React 19 + TypeScript + Tailwind 4.
- Route Handlers Node.js.
- Supabase/Postgres como fonte durável.
- Service role apenas no servidor; sessão/autorização em toda rota mutável.
- Módulos: `catalog`, `amazon-export`, `marketing`, `approval`, `e2e/fixtures`.
- Publicação Amazon e anúncios pagos: fora do escopo de fechamento; apenas handoff e planos revisáveis.
- Fonte de verdade operacional: Supabase + exports versionados + evidência E2E.

## Sprints e Stories

O backlog executável está detalhado em `SPRINTS.md`. Ordem:

```text
S0 Fundação e segurança
  ├── S1 Catálogo e Seller Handoff
  └── S2 Marketing Readiness
          └── S3 E2E, deploy e encerramento
```

## Correção de segurança desta rodada

- `POST` e `PATCH /api/marketing-profiles` exigem listing ativo pertencente ao owner + organização autenticados.
- O lookup da aprovação mais recente mantém `order('created_at', { ascending: false })`, aplica `.limit(1)` e usa `maybeSingle`, evitando `PGRST116` quando há múltiplas decisões.
- `POST /api/extract` falha fechado com sessão verificável tanto no middleware quanto no route handler; a UI envia credenciais de sessão e não há exceção pública para o extractor.
- `launch_ready` exige `gate.ready` e a decisão de aprovação mais recente exatamente `approved`; aprovação antiga invalidada por rejeição/alteração solicitada recente não libera a transição.
- A migration faz preflight de existência das sete tabelas antes de qualquer `ALTER TABLE`, aborta com `SAFE_MIGRATION_ABORTED` e lista de tabelas ausentes, verifica NULLs e somente depois aplica `NOT NULL`; mantém RLS owner-only, `archived` e unicidade por organização sem owner falso.
- Ausência de decisão retorna HTTP 400 com `APPROVAL_REQUIRED`; decisão mais recente não aprovada retorna HTTP 400 com `APPROVAL_NOT_CURRENT`; a validação ocorre antes do upsert/update.
- Transições `draft`, `research_ready`, `campaign_plan_ready`, `tracking_ready` e `approval_pending` permanecem disponíveis; planos, aprovação e publicação continuam separados.
- S3-05 permanece pendente; esta correção não é QA independente, migration remota, deploy ou publicação.

## Gates

- **Gate de escopo:** Sergio confirma que o fechamento é Product Preparation + Seller Handoff, sem publicação automática.
- **Gate de segurança:** não usar dados reais até auth/RLS e secrets estarem validados.
- **Gate de operação:** não executar migração, deploy ou publicação externa sem aprovação específica.
- **Gate de aceite final:** só marcar `concluido` quando todos os critérios deste PRD e do E2E tiverem evidência.

## Definition of Done do projeto

- [ ] Todos os Stories S0–S3 concluídos e verificados.
- [ ] `npm test`, `npm run typecheck` e `npm run build` passam no commit de fechamento.
- [ ] Auth/RLS e isolamento entre usuários/SKUs testados.
- [ ] Fluxo de catálogo e export Seller Handoff testado com fixture realista.
- [ ] Marketing profile, margem, planos, aprovação e export de pacote testados com readback.
- [ ] E2E sobrevive reload e restart no ambiente declarado.
- [ ] Deploy/health/readback documentados ou, se não houver deploy, o projeto é explicitamente classificado como local-only.
- [ ] Sergio aprova o escopo final e o status muda para `concluido`.

## Handoff

```yaml
de: "David"
para: "Sergio / executor das Sprints"
card: "PRD-002"
objetivo do job: "Fechar o FBR PreListing como preparação de produtos Amazon Seller com handoff auditável"
entregável: "F:/Projetos/FBRSigns-web/PreListing/PRD-002-fechamento-fbr-prelisting.md e SPRINTS.md"
decisões/suposições:
  - "FATO: o commit atual 33747c7 está em main e sincronizado com origin/main; a execução local passou com 56 testes em 9 arquivos."
  - "FATO: auth server-side fail-closed e filtros owner/organização foram verificados localmente; provider real, RLS/migration e deploy não foram verificados."
  - "FATO: QA independente final classificou o código como APROVADO COM BLOQUEIOS EXTERNOS."
  - "DECISÃO PROPOSTA: publicação automática Amazon fica fora do fechamento desta versão."
pendências/blockers:
  - "S0-02, alta, owner: infra/backend; adapter server-side e filtros locais existem, mas provider real, RLS e migration remota não foram verificados."
  - "Gate de Sergio, média; confirmar escopo Product Preparation + Seller Handoff."
gate: "entrada"
critérios de aceite/evidência:
  - "PRD e backlog existem, estão no repositório e passam git diff --check."
  - "Cada Story tem dependência, owner, ação, evidência e aceite verificável."
  - "Status não declara fechamento técnico antes das Sprints e do E2E."
```
