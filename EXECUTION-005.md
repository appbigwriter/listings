# Execução S4–S12 — incremento de 05/10/2026

Sergio autorizou iniciar todas as sprints autonomamente. Foram realizadas alterações de código, dezesseis migrations adicionais no Supabase, testes e verificações reais somente de leitura. Os gates do backlog não foram dispensados. Este incremento inicia as frentes por dependência; **as 54 stories não estão concluídas**.

## Evidência deste incremento

- Supabase PreListing `yigqsjevwvqxrxvqhvtd`: segurança operacional, histórico, orçamento IA, reconciliação, feeds, evidências privadas, eventos e reserva eBay aplicados; 19 migrations no histórico incluindo as 3 anteriores. Os 2 prelistings legados permanecem sem proprietário atribuído. Zero usuários Auth; nenhuma publicação.
- Marketing: RLS nas 6 tabelas, anon sem SELECT, authenticated sem INSERT/TRUNCATE, vínculos compostos impedem filho de outro owner/org. Testes em PostgreSQL local preservam legado e provam isolamento.
- Sessões: papéis confiáveis, revogação efetiva consultada em cada request, CSRF/origem, leitura de JSON com teto de bytes, refresh do cliente e convite/definição de senha. Sem usuários reais para homologar login/SMTP.
- Histórico: snapshots de produto gravados pelo trigger na transação, sem reescrita de versões pelo service_role. Budget: reservas diárias atômicas por organização, usage/tokens e limites de entrada/saída. Cancelamento: checkpoint não ressuscita lote cancelado.
- Amazon: cache LWA concorrente, código de erro sanitizado/request ID/quota; discovery exato GTIN/ASIN; Product Fees; feed JSON v2.0 com preparação, reserva atômica, upload, createFeed, relatório por SKU e monitor automático implementados; sem envio real; payload/target persistidos no envio e reconciliação conservadora de atributos. Testes bloqueiam outra versão enquanto a anterior é incerta.
- eBay: executor inicial standalone com conta comprovada/Inventory/Offer/publish/readback; famílias/revisões e homologação pendentes. Walmart tem renovação OAuth/taxonomy/Get Spec; não há publicação completa. TikTok continua indisponível.
- Rede: DNS verificado e fixado no socket para imagens/schemas/referências; redirects e consumo comprimido limitados. Testes negativos de DNS/IP/bytes. Docker web/worker/healthcheck e CI preparados.
- Fonte real somente leitura: **203/203 normalizados, 22 pais, 107 filhos, 74 standalone**, sem SKU duplicado/inválido na prévia. Serviços/fatos/identidades comerciais ainda exigem decisão. Fonte original não foi alterada.
- Diagnóstico Amazon real: **LWA HTTP 400 `invalid_grant`**. Não avançou para calls da conta.
- Navegador: central renderizou a prévia 203 válidos/0 inválidos, botão de feed e cancelamento. Não foi clicada importação nem criada identidade fictícia no banco. Evidência: `artifacts/catalog-sprints-preview.png`.
- Validação local: testes/typecheck/build/audit registrados ao final da execução. Docker Desktop foi iniciado na retomada, mas daemon/CLI não responderam: build da imagem e execução supervisionada não homologados. CI ainda precisa executar no GitHub.

## Estado por story

`em_execucao` significa entrega parcial com trabalho remanescente indicado. `bloqueada` significa que o próximo avanço de aceite depende de dado/acesso/decisão externa. O detalhamento de aceite continua em `SPRINTS-004-operacao-completa.md`; nenhuma pendência abaixo foi resolvida apenas com documentação.

| Story | Estado | Entrega / próximo requisito |
|---|---|---|
| S4-01 | concluida | Catálogo/RLS/grants já verificados remotamente. |
| S4-02 | bloqueada | Identificar owner dos 2 registros; backfill não executado. |
| S4-03 | em_execucao | CLI de convite/papéis e conclusão de senha prontos; faltam e-mails, organização operacional e decisão de colaboração. |
| S4-04 | em_execucao | Segurança/roles/sessões/refresh implementados; falta E2E com usuários reais. |
| S4-05 | em_execucao | Migration/grants/FKs/RLS reais aplicados; falta CRUD/homologação de marketing com identidade real. |
| S4-06 | concluida | Antiga função fechada, grants testados, advisor revisado; exceção intencional da RPC de sessão documentada. |
| S5-01 | bloqueada | Aplicação privada/permissão Product Listing precisa de conferência na conta. |
| S5-02 | bloqueada | Diagnóstico `invalid_grant`; falta refresh token válido no ambiente. |
| S5-03 | em_execucao | Transporte/diagnóstico/single-flight/quota preparados; leituras dependem S5-02. |
| S5-04 | em_execucao | Catalog Items por GTIN/ASIN e retorno de classificações; falta comprovar identidade real. |
| S5-05 | bloqueada | Schemas/validator existentes; homologação oficial aguardando token válido. |
| S5-06 | bloqueada | Marca/GTIN/isenção/restrições/Custom/documentação são decisões comerciais reais. |
| S6-01 | em_execucao | Toda fonte normalizada em CLI/navegador; importação produtiva aguarda owner real. |
| S6-02 | em_execucao | Envelope atual preservado, histórico relacional transacional aplicado; falta testar versões em operação real. |
| S6-03 | bloqueada | Formulário/provenance existentes; faltam fichas/medidas/certificados reais. |
| S6-04 | em_execucao | Importação promove pais e preserva SKU dos filhos; temas oficiais/famílias reais aguardam schema. |
| S6-05 | em_execucao | Diff novo/alterado/inalterado e ausência em snapshot completo, reconciliação/invalidação/histórico; arquivamento/restauração com motivo, admin e guarda transacional de versão/envios implementados; autoridade contínua por campo permanece pendente. |
| S6-06 | bloqueada | Leitura/vínculo da população Amazon existente depende de token e decisão de report/API. |
| S7-01 | em_execucao | Geração factual/grounding existente, limites adicionados; faltam corpus anotado e eval ao vivo. |
| S7-02 | em_execucao | Candidatos oficiais/recomendação existentes; baixo confidence exige revisão; falta homologação real. |
| S7-03 | em_execucao | Copy en_US independente por canal em geração/editor/hash/readiness/payload, fallback preserva rascunhos legados, custos/tokens registrados; falta corpus e homologação real (outros locales não suportados). |
| S7-04 | em_execucao | Editor/validator central existentes; segurança de entradas reforçada; condicionais de schemas reais aguardam S5-05. |
| S7-05 | em_execucao | Checagem de imagens com DNS fixado e Storage privado PDF/PNG/JPEG, versões/sha256/limite/FK/papéis e recuperação; scan clamd privado antes do upload/liberação com receipt e rescan; faltam scanner/assinaturas/retensão reais e aprovação física/documental. |
| S7-06 | em_execucao | Quota/usage/limites e reserva monetária atômica opcional, preços datados/contexto/calls/estimativa; falta corpus anotado e validação de custos reais. |
| S8-01 | em_execucao | Amostra sanitizada de 20 existente; falta seleção operacional dos 20 casos elegíveis. |
| S8-02 | bloqueada | Depende dos fatos/documentos do piloto. |
| S8-03 | bloqueada | Preview existe; token inválido impede validar/corrigir erros reais. |
| S8-04 | em_execucao | Aprovação individual e lote até 100 com revisão por item/hash/versão, bloqueios e CAS; falta piloto de revisão real. |
| S8-05 | em_execucao | Regressões de banco/rede/fila e smoke de navegador; falta sessão real/restart/dois usuários. |
| S8-06 | bloqueada | Sergio precisa aceitar piloto e identificar SKUs/versões autorizados após QA. |
| S9-01 | bloqueada | Executor individual com reserva atômica da versão; não há piloto autorizado por SKU/versão. |
| S9-02 | em_execucao | Ledger captura payload/target, índice bloqueia versões incertas, readback conservador; falta simular crash e homologar live. |
| S9-03 | em_execucao | Feed/monitor/relatório, resultado por SKU transacional e nova tentativa explícita para falha comprovada antes de createFeed, preservando histórico; falta homologação real/crash de processos externos. |
| S9-04 | em_execucao | PATCH merge preço/estoque FBM, reserva atômica da versão, manifesto/hash/ledger e confirmação explícita de autoridade; falta homologação, autoridade por campo persistente e compensação. |
| S9-05 | em_execucao | Consumidor EventBridge→SQS, contratos oficiais, origem/assinatura/conta, dedup/leases, readback atual e ack após término durável; template com DLQs preparado. Ativação/homologação dependem da conta AWS/destino/permissões. |
| S9-06 | bloqueada | Monitoramento individual existe; aceite depende de catálogo publicado e histórias anteriores. |
| S10-01 | em_execucao | Taxonomy/OAuth/copy/pacote, conta imutável comprovada, policies/NEW/localização, reserva atômica e executor Inventory/Offer/publish/readback standalone; aspectos requeridos/cardinalidade/enums/datas e condicionais de um controlador validados; condicionais avançados bloqueados. Faltam famílias/revisões/recuperação sem offerId e homologação. |
| S10-02 | em_execucao | Taxonomy/Get Spec + OAuth renovável; faltam payload/feed/processamento/readback. |
| S10-03 | bloqueada | Aplicação/shop/versão/região TikTok não informadas; conector ainda não implementado. |
| S10-04 | em_execucao | Matriz de capacidades e UI bloqueiam ações não suportadas; formatos oficiais completos por canal continuam. |
| S10-05 | em_execucao | Tokens renováveis/segredos server-side; falta onboarding multicon­ta, revogação e sync com autoridade. |
| S10-06 | bloqueada | Pilotos completos dependem de acessos/conectores e autorização por versão. |
| S11-01 | em_execucao | Docker web/worker/secrets/loopback preparados; daemon/destino/HTTPS/staging ausentes. |
| S11-02 | em_execucao | Worker durável, cancelamento e supervisor; retomada explícita de falhas/pendentes cria novo lote idempotente com versões atuais e preserva checkpoints antigos. Falta ensaio real de restart/escala. |
| S11-03 | em_execucao | Painel com filas/reservas expiradas/erros/claims incertos/uso IA a partir dos ledgers duráveis; faltam alertas externos e correlation end-to-end. |
| S11-04 | bloqueada | Backup/PITR, staging de restauração e RPO/RTO precisam de escolha/ambiente; história não concluída. |
| S11-05 | em_execucao | DNS/bytes/JSON/cookies/roles/audit e paginação 5.000; benchmark local 5.000 rascunhos: 406 ms, +7 MB heap, RSS124 MB. Falta carga real DB/API/worker/browser e metas. |
| S11-06 | em_execucao | CI e regressões SQL, timestamps remotos reconciliados; tipos remotos gerados e RPC de aprovação tipada; todas as migrations executadas automaticamente nos testes PostgreSQL. Faltam CI real/drift remoto/staging/release. |
| S12-01 | em_execucao | Product Fees consultável com preço/fulfillment/data; falta alimentar custos reais e conectar economics/margem por canal. |
| S12-02 | em_execucao | Revisão com snapshot/hash/HMAC, decisão/status transacionais, custos pela tela com fonte/data e CAS, aprovação invalidada por preço/custos/planos/tracking. Homologação real de reload/papéis permanece. |
| S12-03 | em_execucao | Handoff/UTMs/Kanban existentes; falta homologar no destino real; anúncios/gastos não executados. |
| S12-04 | em_execucao | Manual de fluxo/credenciais/recuperação preparado; falta treino de equipe real e validação de responsabilidades. |
| S12-05 | bloqueada | 203 registros contabilizados na prévia; rollout aguarda piloto, fatos, restore e liberação por canal. |
| S12-06 | bloqueada | Aceite final depende dos gates; não há declaração de funcionamento 100%. |

## Próximo avanço

1. Receber e-mails/identidade para criar as contas reais e concluir S4-02/03/04/05 e importação.
2. Corrigir o grant Amazon no secret store/`.env` conforme `AMAZON-API-SETUP.md`, executar leitura/schema/discovery/preview sem publicação.
3. Completar os fatos/documentos dos 20 casos e exercitar o piloto com sessão real.
4. Fechar os itens de código ainda pendentes (feeds/PATCH/notificações, revisão em lote, conectores completos, colaboração, storage/observabilidade), homologando cada incremento no ambiente adequado.
5. Publicar somente o piloto e versões explicitamente aceitos, testar recuperação e então ampliar cobertura.

Validação da retomada: 177 testes em 34 arquivos; typecheck passou. Build final passou com 39 rotas, incluindo tracking/paginação/retomada e confirmação de identidade do PATCH. Advisor remoto mantém somente a exceção intencional da RPC de sessão. Banco remoto sem importação, arquivos ou envios produtivos.

Operação/configuração: `OPERATIONS-005.md`. Evidência visual: `artifacts/catalog-sprints-preview.png`. Nenhuma credencial deve ser enviada pelo chat.

## Incremento posterior

Conteúdo: copy específica en_US por canal, com validação de campos/limites, geração/grounding no canal e hash/readiness/atributos usando o texto correspondente. Rascunhos sem copy continuam usando o texto base e o mesmo formato de hash. Fatos técnicos continuam compartilhados; edição de fatos/base ou configuração global ainda pode invalidar aprovações de outros canais.

eBay standalone: migration `20261005193506_channel_submission_claim.sql` aplicada. Prévia inclui conta comprovada por Identity API (somente userId retido), inventário/oferta/policies/versão/hash. Antes das escritas, conferir policies/condição NEW/localização e ausência de inventário/ofertas; reserva trava a versão e a incerteza. Checkpoints capturam estágio/offerId/listingId; timeout não libera replay. Readback exige todos os campos esperados e offer PUBLISHED/listingId; diferenças normalizadas ficam para investigação. Sem offerId confirmado não tenta criar outra oferta. Publicação fica desligada por configuração; nenhum recurso/listing eBay real criado. APIs oficiais consultadas: Inventory v1.18.8, Identity v2.0.0 e Metadata v1.13.0 em `artifacts/ebay-*-openapi.json`.

Eventos: migration `20261005191420_catalog_notification_events.sql` aplicada. O novo consumidor usa origem EventBridge explícita, schemas oficiais com correção documentada do enum divergente de status, versões exatas e marketplace comprovado. Deriva owner do SKU da organização configurada; registra tentativas antes da consulta atual e conclui antes do DeleteMessage. Eventos inválidos/falhas não são removidos. Conta AWS/partner bus/subscriptions/DLQs/IAM ainda não existem nesta implementação; template preparado não equivale a recursos criados.

Recuperação de falha comprovada: migrations `20261005191851_feed_preflight_retry.sql` e `20261005192122_atomic_feed_outcomes.sql` aplicadas. Retry requer referência ao lote anterior, mesmo manifesto/versão/target e todos os claims rejeitados com external_started=false; createFeed incerto, outra conta, versão alterada ou nova tentativa existente bloqueiam. Novos IDs/números de tentativa preservam histórico. O relatório atualiza ledger e projeção de submissão na mesma transação; guarda de lease/versão impede downgrade de reconciliação e escrita sobre edição mais recente.

Evidências privadas: migration `20261005185007_catalog_assets.sql` aplicada e bucket `prelisting-evidence` confirmado private/5 MB/PDF-JPEG-PNG, sem políticas de acesso direto ao cliente. Zero arquivos produtivos. API autenticada exige produto ativo do mesmo owner/org, checksum para download/recovery, attachment/no-store/nosniff/sandbox. Assinatura MIME valida o formato básico, não substitui antimalware nem confirma a validade do certificado. Arquivos não são enviados automaticamente à Amazon.

GTIN e MPN fornecidos agora precisam de fatos confirmados; alteração invalida a confirmação. O MPN entrou no formulário/provenance. eBay não reaproveita ASIN/isenção Amazon como identidade; consulta policies/condições sem escolher políticas automaticamente. OpenAPI oficial Inventory v1.18.8 consultado: https://developer.ebay.com/develop/api/spec/inventory_api.json.

A interface de revisão/ofertas/saúde foi verificada no navegador sem gravações produtivas (`artifacts/catalog-operations-preview.png`). Dev usa `.next-dev` separado de `.next`, evitando conflito com o build, e o ensaio local ficou limitado ao loopback. Relatório do benchmark: `artifacts/catalog-benchmark.json`.

Reserva USD: migration `20261005190025_ai_cost_reservations.sql` aplicada. Orçamento opcional por org/dia UTC, reservas conservadoras mantidas mesmo em falha, tokens conhecidos estimados com tarifa uncached e custos desconhecidos explicitados. Preços default gpt-4o-mini conferidos em 05/10/2026, vencem após 30 dias; outro modelo exige configuração. Runtime bloqueia calls extras/modelo/contexto fora da reserva. Isso não equivale a teto de fatura da conta OpenAI.

ID de feed perdido: administrador pode associar ID após evidência no Seller Central; valida tipo/marketplace/janela temporal e registra atestado vinculado ao manifesto. Não é uma correlação automática comprovada pela API. Relatório ainda precisa resolver cada SKU e submissão incerta continua sem reenvio automático.

## Retomada às 20:10 — 05/10/2026

Migration `20261005231501_marketing_approval_versions.sql` aplicada e reconciliada com o timestamp remoto. Decisões agora guardam snapshot, hash e assinatura server-side; a transação verifica versões do listing/perfil/planos e grava decisão e status juntos. Alterar produto, custos, campanhas ou tracking invalida a aprovação; decisões antigas sem assinatura não são reaproveitadas. Lock breve das três tabelas de planos durante a decisão impede inserção concorrente de um plano ausente na revisão; homologar contenção em carga real. Apenas service_role executa essa RPC (verificado remotamente). Sem usuários ou aprovações produtivas criados.

APIs de marketing calculam a margem com preço/estoque do catálogo. Custos USD têm edição com fonte/data, todos os sete campos explícitos e CAS do perfil; zero não é inferido. Revisão mostra o conteúdo completo antes da confirmação. Destinos HTTPS Amazon US precisam apontar ao ASIN do SKU, sem homepage/credenciais/host parecido. Pacotes JSON/Markdown usam o mesmo snapshot revisado; Kanban interno usa hash na idempotência e exige aprovação atual. A integração com um Kanban externo e o readback real continuam pendentes.

Migration `20261005194420_evidence_scan_receipts.sql` aplicada. INSTREAM clamd privado registra engine/base/data; assinatura com mais de 72h ou resposta incompleta bloqueia. Upload escaneia antes da reserva/Storage; download confere hash e renova análise após 24h ou base vencida. Sem host configurado, produção não libera upload/download. Exceção explícita apenas em não produção registra skipped. Scanner não foi instalado/homologado; testes usaram servidor TCP local do protocolo.

Taxonomy eBay implementa required, SINGLE/MULTI, enums, limite de caracteres, formatos de data/número e dependência de um controlador. Múltiplos controladores e intervalos numéricos avançados falham explicitamente; não há alegação de suporte universal a condicionais.

Tipos do schema remoto em `lib/supabase/database.types.ts`, gerados após as 19 migrations. O advisor mantém somente o WARN intencional de `prelisting_session_active()` (própria sessão, retorno booleano). Regenerar tipos após nova migration; não afirmar drift remoto automatizado.

## Continuação da retomada

Migrations `20261005232616_amazon_submission_version_claim.sql` e `20261005233146_catalog_archive_lifecycle.sql` aplicadas e reconciliadas. PUT individual e PATCH Amazon agora reservam a versão atual na transação antes da escrita externa; resultado diferente de ACCEPTED/INVALID mantém unknown, sem liberar replay como rejeitado. O monitor compara atributos atuais antes de gravar verified_content_hash/BUYABLE; marketing requer preparação aprovada e prova da versão vendável. Normalizações remotas divergentes continuam exigindo investigação, não são assumidas equivalentes.

Arquivar/restaurar é exclusivo de administrador, com motivo e versão explícitos. Transação trava o SKU, impede envio ativo/incerto e remove aprovações/report. Restore volta a draft; listings externos não são apagados nem alterados. Histórico captura as duas transições. Consulta visual local mostrou zero arquivados, sem gravar dados (`artifacts/catalog-archive-preview.png`). RPC client sem EXECUTE/service_role com EXECUTE, confirmado remotamente.

Campos server-owned (preview, fees, source_update/source_resolution, arquivo, identidade de tenant e observações) não são aceitos de criação/edição comum. A importação já normaliza uma lista de campos permitidos; o worker usa função explícita para marcar alteração de fonte, preservando fatos e invalidando aprovações. Não apagou pendências nem injetou resultados da plataforma.

Retomada explícita de lotes locais: selecionar falhas finais ou entradas após o checkpoint de lote terminado/cancelado. Cria novo lote por parent/scope, com versões atuais para ações de preparação; importar mantém o snapshot originalmente revisado. Chave fixa por parent/scope impede cliques repetidos criarem outras tentativas mesmo se o produto mudar depois. Nova falha pode ser retomada a partir do lote filho. Fluxo não inclui envio/publicação.

Nova checagem somente leitura da fonte às 20:39: 203 válidos, zero inválidos, 22 pais/107 filhos/74 standalone. npm audit: zero vulnerabilidades. Banco remoto continua com 2 produtos sem owner, zero usuários/submissões/feeds/assets/aprovações. Tipos regenerados após as 19 migrations.

## Tracking e listagem de marketing

Migration `20261005235250_tracking_attribution_configuration.sql` aplicada. Tag e status configurado são persistidos com limite/contrato; informar um tag mantém configured_unverified, sem afirmar elegibilidade, Purchase ou acesso real ao Attribution. Configuração faz parte do snapshot/histórico de revisão. Tipos regenerados após a migration; leitura remota confirmou as colunas.

Perfis têm paginação de 20 e JOIN interno pelo FK composto de catálogo/tenant, excluindo arquivados sem lista de 5.000 SKUs em URL. Consulta REST real de leitura validada com zero resultados e sem criar identidade. Perfis launch_ready são revalidados contra gate/hash atual; lista não reaproveita status antigo.

Docker: tentativa de inicialização local realizada, sem criar containers ou recursos externos; comandos de engine/status não responderam e os clientes de leitura foram encerrados. Imagem/supervisor continuam sem homologação. Runner preparado com dependências somente de produção; tsx passou para dependency de runtime dos workers. Lockfile auditado com zero vulnerabilidades.

Oferta Amazon: manifesto exige ASIN existente confirmado; getListingsItem precisa retornar SKU, marketplaceId e ASIN correspondentes antes de reservar/enviar PATCH. Divergência bloqueia sem escrita externa. [Contrato oficial getListingsItem](https://developer-docs.amazon/sp-api/lang-en_en/reference/getlistingsitem). Validação final: 177 testes/34 arquivos, typecheck e build/39 rotas passaram. Sem alterações produtivas de catálogo ou marketplace.

Prévia local encerrada em modo de identidade de teste. Servidor de desenvolvimento limitado a 127.0.0.1:3100 agora exige supabase-session/local-only=false; navegador confirmou /login (artifacts/catalog-auth-session-preview.png). Nenhum usuário/owner fictício foi criado no banco. Login operacional aguarda os e-mails reais já solicitados.
