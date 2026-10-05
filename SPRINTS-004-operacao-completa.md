# Sprints S4–S12 — operação completa do FBR PreListing

Versão 1, 05/10/2026. **54 stories novas**, mantendo S0–S3 como histórico. Sergio autorizou as migrations do catálogo e solicitou o backlog para operação completa; informou que a empresa já foi aprovada na Amazon. Acessos necessários: `AMAZON-API-SETUP.md`. Evidência do banco: `MIGRATION-004-verification.md`.

## O que significa funcionar 100%

O sistema deve conduzir cada registro da loja a um resultado rastreável: produto elegível preparado/aprovado/publicado quando autorizado; produto com pendência encaminhado para resolução; serviço/registro incompatível explicitamente excluído. Não se promete aprovação de todos os produtos pela Amazon, nem decisões técnicas inventadas pela IA.

O escopo inicial é Amazon US e, depois de homologação, eBay US, Walmart US e TikTok Shop US. Cada canal precisa de conta/aplicação/permissões próprias. Mercado Livre e outras regiões permanecem expansão a definir, com localização, tributação/logística e moeda específicas; não contam como conectores já entregues. A arquitetura deve permitir sua adição sem reescrever o núcleo.

Produção exige sessão real, escopo da organização, fatos com evidência, schemas oficiais vigentes, mídia adequada, GTIN/isenção/marca, famílias consistentes, aprovação vinculada à versão, fila durável, envio autorizado, reconciliação, segurança, backup e operação observável. Os critérios de publicação diferenciam parent, serviço excluído, oferta FBM/FBA, produto aceito e produto comprável. Marketing deve ter persistência e gates funcionais; publicação de anúncios/gastos, pedidos e fulfillment operacional completo não estão autorizados por este plano.

## Estado de partida

- Core implementado: central, importação, fatos/provenance, revisão assinada, adapters, validation preview Amazon, publicação individual controlada, readback e worker com checkpoints.
- **60 testes locais aprovados** na execução anterior; nova regressão de grants incluída nesta rodada. Não equivalem a homologação ao vivo de marketplace.
- Catálogo público: 203 registros incluindo variantes. Amostra de 20 já normalizada; piloto de 20 listings na conta Amazon ainda não executado.
- Banco do catálogo ativado nesta rodada, com grants explícitos/RLS verificados e 2 registros legados preservados. Fonte da loja não alterada.
- 0 usuários no Supabase Auth; 2 registros legados sem owner/org; tabelas antigas de marketing sem escopo; função anterior apontada pelo advisor.
- Amazon LWA: HTTP 400 `invalid_grant`. eBay/Walmart sem homologação; TikTok sem conector. Nenhum produto foi publicado.

## Regras de execução

Estados: `pendente`, `em_execucao`, `bloqueada`, `implementada_localmente`, `homologada`, `concluida`. Salvo indicação explícita, todas as stories abaixo estão **pendentes**. Código existente é reaproveitado, não refeito automaticamente; a story fecha o que falta e exige evidência real.

Responsáveis são papéis: **Conta = Sergio/administrador autorizado**, **Backend**, **Frontend**, **IA/Catálogo**, **Infra**, **QA**, **Operação FBR**. Nenhum prazo/calendário de equipe foi assumido. A duração será definida por capacidade e pelo tempo de liberação de acessos; tratar como incrementos com gate de saída, não como datas prometidas.

Definition of Done comum: critérios atendidos; teste adequado executado; evidência sanitizada em `artifacts` ou relatório; documentação/status atualizados; ausência de segredo em logs/bundle; teste de isolamento quando envolver dados; readback após escrita externa. Mutação externa não é validada por mock. Aplicações de novas migrations, deploys, publicação de listings e anúncios precisam de autorização específica quando não cobertos pela autorização atual.

## Sequência e gates

| Sprint | Entrega | Stories | Gate de saída |
| --- | --- | ---: | --- |
| S4 | Banco, usuários e segurança operacional | 6 | Usuário real trabalha no próprio escopo; legado preservado; marketing seguro. |
| S5 | Acesso Amazon e discovery oficial | 6 | Token válido e operações de leitura/schema comprovadas na conta correta. |
| S6 | Catálogo completo e famílias | 6 | Todos os registros contabilizados, com fonte, tipo e pendências. |
| S7 | IA, requisitos e mídia | 6 | Conteúdo sustentado, requisitos oficiais aplicados e mídia revisável. |
| S8 | Piloto representativo e QA ponta a ponta | 6 | 20 casos representativos com resultado verificável e decisão de operação. |
| S9 | Publicação Amazon e reconciliação | 6 | Envio autorizado sem duplicação e situação externa reconciliada. |
| S10 | Conectores de marketplaces | 6 | Cada canal habilitado só após homologação de seu ciclo completo. |
| S11 | Deploy e operação sustentável | 6 | Ambiente produtivo, worker, alertas, restauração e release controlada. |
| S12 | Marketing funcional e aceite final | 6 | Equipe opera catálogo e exceções; indicadores e aceite documentados. |

S6 pode iniciar após S4 enquanto os acessos de S5 são obtidos. S11 infraestrutura pode avançar em paralelo ao piloto; a liberação produtiva aguarda os gates funcionais. Não publicar um catálogo inteiro para descobrir erros que poderiam ser encontrados no piloto.

## S4 — Banco, usuários e segurança operacional

| Story | Entrega e responsável | Dependências | Aceite e evidência |
| --- | --- | --- | --- |
| **S4-01 — Ativar a base do catálogo** | Infra/Backend: aplicar as duas migrations autorizadas e efetivar grants mínimos. **Concluída nesta rodada**, incluindo complemento de grants padrão. | Autorização de Sergio já recebida. | Histórico remoto confirma aplicação; RLS nas 3 tabelas; authenticated sem INSERT/UPDATE/TRUNCATE em jobs/submissions; Data API acessível; 2 registros e digest original preservados. Evidência: `MIGRATION-004-verification.md`. |
| **S4-02 — Resolver identidade dos registros legados** | Conta/Backend: identificar quem deve possuir os 2 registros, revisar mapeamento e executar backfill auditado. | S4-01, S4-03. | Nenhum owner inventado; mapeamento aprovado por ID; registros aparecem somente ao escopo correto; conteúdo original preservado; constraint de ownership validada quando não houver legado pendente. |
| **S4-03 — Criar usuários e organização operacional** | Conta/Backend/Frontend: cadastrar ou convidar usuários reais, definir organização e papéis operador/revisor/admin. | S4-01. | Login de dois usuários reais; convites/recuperação; `app_metadata` administrado no servidor; política de colaboração da empresa definida. Mudar de owner-only para catálogo compartilhado exige modelo de memberships/RLS testado, não remover filtros. |
| **S4-04 — Homologar sessões e autorização produtiva** | Backend/QA: revisar refresh, expiração, logout/revogação, cookies, CSRF e autorização por função. | S4-03. | Fluxo login→reload→expiração→logout verificável; mutações sem sessão negadas; usuário de outra organização não lê/edita/aprova; local-only impossível em produção; operador não publica sem privilégio. |
| **S4-05 — Migrar o módulo antigo de marketing** | Backend/Infra: preflight das 6 tabelas, mapeamento de identidades, escopo e políticas compatíveis com o catálogo. | S4-02, S4-03. | CRUD de perfis/planos/approvals/tracking/kanban funciona em sessão real; isolamento negativo em dois usuários/organizações; legado preservado; SQL e rollback revisados antes de aplicar. |
| **S4-06 — Fechar os achados de segurança do banco** | Infra/QA: revisar `rls_auto_enable()` e grants/defaults, funções, políticas e acessos da Data API. | S4-01, S4-05. | Função SECURITY DEFINER anterior não permanece publicamente executável sem justificativa; grants e advisors revisados; testes de leitura/escrita e TRUNCATE negativo. Grants do catálogo já corrigidos; função e marketing continuam pendentes. |

## S5 — Acesso Amazon e discovery oficial

| Story | Entrega e responsável | Dependências | Aceite e evidência |
| --- | --- | --- | --- |
| **S5-01 — Confirmar/criar a aplicação privada SP-API** | Conta: usar perfil aprovado e uma aplicação privada da FBRSigns; conferir Product Listing e autorizações da conta. | Acesso do usuário principal ao portal. | App identificado, tipo Sellers privado, papel selecionado; autorização da conta correta; App ID registrado sem segredos. Não confundir aprovação de seller com aprovação do perfil/app/roles. |
| **S5-02 — Resolver LWA e guardar credenciais** | Conta/Backend/Infra: obter client ID/client secret e refresh token da mesma aplicação; corrigir `invalid_grant`; armazenamento/rotação. | S5-01. | LWA retorna access token, sem segredos em logs; revogação/expiração tratadas; IDs e marketplace conferidos; diagnósticos distinguem 400 LWA, 401 e 403 SP-API. Hoje bloqueada pelo grant não aceito. |
| **S5-03 — Homologar operações e limites da conta** | Backend/QA: health check de Product Types, schema, Catalog Items, Listings e restrições; matriz de papéis. | S5-02. | Evidência de leituras na conta US, erros acionáveis por operação, métricas de quota/rate-limit; 403 não tratado como catálogo vazio; client cache/refresh concorrente sem corrida. Sellers API só se papel adicional confirmado. |
| **S5-04 — Descobrir ASIN, tipo e navegação oficiais** | Backend/IA/Catálogo: consultar Catalog Items/Definitions, resolver browse/classificação e GTIN existente antes de criar item. | S5-03. | SKU com ASIN existente é distinguido de novo produto; marca/identidade conferidas; recomendação contém candidatos oficiais, confiança e justificativa; baixa confiança vai a revisão; não criar duplicata por título parecido. |
| **S5-05 — Homologar schemas reais e cache** | Backend/Frontend/QA: validar schemas da conta para standalone, parent e child, incluindo condicionais, custom keywords e lifecycle/depreciações. | S5-03. | Pelo menos os tipos piloto compilam e exibem campos requeridos; enum inválido/condicional/referência desconhecida bloqueia; versão/cache/checksum e expiração testados; refresh de requisitos invalida aprovação quando necessário. |
| **S5-06 — Fechar elegibilidade comercial por SKU** | Conta/Operação FBR: GTIN/isenção, marca, categoria restrita, Custom/FBM e documentação de itens elétricos. | S5-04. | Cada SKU piloto tem decisão e evidência; restrições por ASIN encaminhadas à ação correta; Custom suportado separado de personalização manual; aprovação da empresa não libera automaticamente toda marca/categoria/produto. |

## S6 — Catálogo completo, fonte e famílias

| Story | Entrega e responsável | Dependências | Aceite e evidência |
| --- | --- | --- | --- |
| **S6-01 — Homologar a importação do catálogo inteiro** | Backend/QA/Operação: conferir a fonte, paginação, IDs/SKUs, títulos problemáticos, duplicatas e limites de arquivo. | S4-03, S4-04. | Todos os 203 registros atuais contabilizados como importados, excluídos ou erro explícito; nenhum truncamento silencioso; repetição não duplica; mudança de fonte gera reconciliação; usar SKU/ID estável. |
| **S6-02 — Consolidar produto, variante e listing por canal** | Backend: decidir quais entidades precisam sair do JSON para tabelas relacionais; histórico de versões e IDs externos. | S6-01. | Produto mestre não é confundido com oferta/parent; índices/constraints e rastreio de versões demonstrados; migração incremental preserva o envelope atual. Evitar normalização sem benefício; campos consultados/versionados precisam de consistência. |
| **S6-03 — Coletar e confirmar fatos reais** | Operação/Frontend: fichas, origem, material, peso e embalagem, unidades, produção/handling e evidências anexadas. | S6-01. | Importado≠confirmado; conversões explícitas e verificáveis; unidade/preço/moeda definidos; medidas do produto não viram medidas da embalagem; dado ausente cria tarefa com responsável, sem zero/default inventado. |
| **S6-04 — Validar e operar famílias de variantes** | Backend/Frontend/QA: promover pais corretamente, temas, atributos distintivos, SKU/GTIN por filho, ordem e dependências. | S6-02, S5-05. | Família representativa validada e visualizada; pais sem oferta comprável; filhos com parent ativo/coerente; alteração de tema/link bloqueia export/envio; nenhum parent Standalone enviado como família incompleta. |
| **S6-05 — Sincronizar mudanças e resolver conflitos** | Backend/Frontend: diff de fonte com atualizações incrementais, remoções/arquivamento e autoridade por campo. | S6-02, S6-03. | Operador compara antes/depois e decide; exclusão na loja não deleta listing externo automaticamente; alterações técnicas invalidam confirmações/revisão; decisões e motivo auditados; reimportação não sobrescreve conteúdo aprovado. |
| **S6-06 — Vincular catálogo Amazon existente** | Backend/Operação: importar listings já existentes via API/relatório escolhido, mapear SKU/ASIN/parent e evitar duplicação. | S5-03, S5-04, S6-02. | Cada vínculo externo tem conta/marketplace e identidade verificáveis; conflitos ficam pendentes; report type/papel aprovados; comparação entre loja e Amazon produz lista de divergências sem mudar preços/estoque automaticamente. |

## S7 — IA, requisitos, conteúdo e mídia

| Story | Entrega e responsável | Dependências | Aceite e evidência |
| --- | --- | --- | --- |
| **S7-01 — Fortalecer o contrato factual da IA** | IA/Backend: separar observado/confirmado/referência; provenance por campo/claim, confiança e verificador. | S6-03. | IA não converte fonte concorrente em fato; claims/números/certificações sem suporte bloqueados; recusa/timeout não salva como aprovado; prompt injection de produto/referência testada; revisão auditável. |
| **S7-02 — Classificar com candidatos oficiais e decisão humana** | IA/Catálogo/Frontend: recomendação por produto/canal, elegibilidade físico/custom/serviço, browse node e confidence. | S5-04, S6-01. | Produto incompatível encaminhado sem categoria forçada; IDs oficiais, justificativa e fonte; serviços não entram em publicação física; correções aprendidas com rastreio, não alteração cega de catálogo. |
| **S7-03 — Gerar conteúdo adequado ao canal** | IA/Frontend: títulos/bullets/descrições/termos e idiomas locais dentro das regras vigentes por categoria. | S7-01, S5-05. | Conteúdo em inglês US nos canais iniciais; sem promoções/claims proibidos; limites de bytes/caracteres aplicados por schema/política; regenerar não inventa material/origem; versão editável com diff e custo por execução. |
| **S7-04 — Completar o editor e o motor de validação** | Backend/Frontend/QA: campos condicionais, referências, enums, dependências e erros ligados ao campo correto. | S5-05, S6-02. | Atributos não contradizem fatos; sem requisito desconhecido ignorado silenciosamente; erro acionável navegável; edição simultânea/concorrente preserva dados ou retorna conflito; export e publish usam o mesmo gate central. |
| **S7-05 — Preparar e revisar mídia/documentos** | Frontend/Backend/Operação: armazenamento, imagens, mockups fiéis, recorte/fundo quando apropriado, qualidade e compliance por categoria. | S6-03, S7-02. | Checagem técnica mais revisão visual; imagem não modifica aparência/quantidade/acessórios do produto; URL acessível à plataforma; imagem revisada vinculada ao checksum; certificados versionados e direitos registrados. |
| **S7-06 — Medir qualidade, custo e comportamento da IA** | IA/QA/Infra: corpus de casos bons/ruins, regressões, orçamento, limites/retries e auditoria. | S7-01, S7-03. | Métricas de factualidade/classificação/revisões com amostra anotada; limite de gasto configurável e consentimento operacional; falha parcial retoma sem repetir custo desnecessário; alteração de modelo/prompt passa pelo corpus antes de promoção. |

## S8 — Piloto representativo e QA ponta a ponta

| Story | Entrega e responsável | Dependências | Aceite e evidência |
| --- | --- | --- | --- |
| **S8-01 — Selecionar os 20 casos reais de homologação** | Operação/QA: sinais, roll-up, itens LED/neon, personalizados, famílias e serviços excluídos, com identidade estável. | S5-06, S6-04. | Lista de 20 casos com cobertura justificada e resultado esperado; fixtures sanitizadas; cada caso ligado ao registro real; não apresentar o teste anterior de normalização como aceitação pela Amazon. |
| **S8-02 — Resolver os dados/documentos do piloto** | Operação/Frontend: preencher embalagem, origem, marca, GTIN/isenção e certificados realmente disponíveis. | S8-01, S6-03. | Cada campo requerido confirmado ou bloqueio documentado com dono; inexistência de informação não resolvida por IA; documentos conferidos com a categoria. |
| **S8-03 — Exercitar validation preview e correções** | Backend/QA/Operação: preview seletivo, parsing de issues e tradução em tarefas, schema vigente e restrições. | S8-02, S5-05, S7-04. | Erros reais por SKU armazenados; correção→nova validação comprovada; preview respeita quota; preview sem errors não é exibido como garantia de publicação; payload e request ID auditáveis. |
| **S8-04 — Homologar aprovação e revisão em lote** | Frontend/Backend/QA: revisão eficiente com filtros/checklists/diffs e responsabilidade por decisão. | S8-03, S7-05. | Aprovação só na versão salva válida; role do revisor conferida; mudança de conteúdo/schema/fato invalida; lote não aprova silenciosamente exceções; export gerado confere com a versão aprovada. |
| **S8-05 — Testar o ciclo real de aplicação e fila** | QA/Infra: login→import→edição→validação→revisão→export, restart e concorrência. | S4-04, S8-04. | Sessão real; dois usuários/organizações; reinício retoma lote; worker concorrente não repete item/envio; limites/429/timeout/leases e resposta incerta testados; evidência de navegador e readback sem segredos. |
| **S8-06 — Aprovar o gate do piloto** | Sergio/Operação/QA: revisar resultados, exceções e decisão para publicação piloto. | S8-05. | 20 resultados completos, incluindo exclusões justificadas; zero bloqueio crítico aberto no fluxo liberado; Sergio registra quais SKUs/versões podem ser enviados. Sem essa decisão, publicação permanece desligada. |

## S9 — Publicação Amazon, manutenção e reconciliação

| Story | Entrega e responsável | Dependências | Aceite e evidência |
| --- | --- | --- | --- |
| **S9-01 — Publicar o primeiro lote controlado** | Backend/Operação: usar envio individual e ledger existente nos SKUs expressamente autorizados. | S8-06. | Reserva persistente antes da chamada; checagem de versão e família; resposta/ID registrados; readback externo confirma conteúdo e issues; 429/erro de rede não provoca retry cego; somente SKUs autorizados. |
| **S9-02 — Reconciliar resultados incertos e reenvios** | Backend/Frontend: recuperar `unknown`, comparar atributos/versionamento e liberar retry apenas com decisão auditada. | S9-01. | Crash antes/depois da resposta não duplica envio; ledger e payload convergem; rejected pode ser corrigido/reenviado com histórico; versão antiga não substitui nova; usuário vê not submitted/accepted/processing/rejected/buyable distintos. |
| **S9-03 — Implementar JSON_LISTINGS_FEED** | Backend/Infra: pacote oficial, documento/upload/feed, limites e relatório por mensagem/SKU. | S9-01, S5-03. | Envio autorizado em lote; messageId único, dependências de família e quota respeitadas; relatório de processamento interpretado por item; falha parcial não marca todos publicados; documento/processing report recuperáveis com acesso controlado. |
| **S9-04 — Atualizar ofertas sem sobrescrever indevidamente** | Backend/QA/Operação: PATCH e diff de campos, autoridade de preço/estoque, FBA/FBM, regras e suspensão de sync. | S6-05, S9-02. | Só campos autorizados enviados; stale version bloqueada; zero estoque não equivale a falha técnica; FBA não recebe quantity DEFAULT de FBM; atualização de título/atributo exige nova revisão; pausa e compensação seguras documentadas. |
| **S9-05 — Receber eventos e atualizar requisitos** | Infra/Backend: Notifications API, destino compatível SQS/EventBridge, consumidor idempotente e polling fallback. | S5-03, S9-02. | Mudança de issues/status/schema gera evento correlacionado ao SKU; duplicatas/out-of-order não regressam estado; DLQ e replay; refresh de schema cria tarefas; credentials AWS do destino separadas de LWA; assinatura/origem validadas. |
| **S9-06 — Homologar a manutenção do catálogo Amazon** | QA/Operação: acompanhar buyability/discoverability/erros e reconciliar o conjunto autorizado. | S9-03, S9-04, S9-05. | Cada SKU publicado tem estado externo e última consulta; parents são avaliados como família, sem exigir BUYABLE; FBA sem estoque distingue preparo de oferta ativa; exceções e supressões têm tarefa/responsável; reconciliação periódica e reconciliação após eventos. |

## S10 — Principais marketplaces e arquitetura de conectores

| Story | Entrega e responsável | Dependências | Aceite e evidência |
| --- | --- | --- | --- |
| **S10-01 — Fechar o conector eBay US** | Backend/Operação/QA: complementar taxonomy/aspects com dependências, políticas da conta, inventory items/offers e publicação. | S8-05, acesso eBay próprio. | OAuth/refresh, site/conta/categoria, condition, localização e políticas de pagamento/frete/retorno; família quando suportada; preview/validação aplicável, publish e readback de piloto autorizado; aspects válidos não apresentados como oferta completa. |
| **S10-02 — Fechar o conector Walmart US** | Backend/Operação/QA: OAuth/refresh, Get Spec vigente, item setup/feed e report de processamento. | S8-05, acesso Walmart próprio. | Spec exata e payload oficial, taxonomia e atributos; account permissions demonstradas; mídia/GTIN/oferta/logística; envio e resultado por SKU de piloto autorizado; failed/processing não vira published. |
| **S10-03 — Implementar o conector TikTok Shop US** | Backend/Operação/QA: app/shop authorization, assinatura, categorias/regras/atributos, mídia, check listing e criação. | S8-05, acesso TikTok próprio. | APIs oficiais da versão/região corretas, shop cipher e token/refresh seguros; categoria restrita corretamente bloqueada; atributos condicionais e documentação; upload/revisão de mídia e produto; piloto autorizado com readback. Sem credenciais/homologação, canal permanece bloqueado. |
| **S10-04 — Unificar capabilities e payloads por canal** | Backend/Frontend: contrato de adapters, regras/estados específicos e UI que exponha somente ações suportadas. | S10-01, S10-02, S10-03. | Produto mestre pode ter classificações/ofertas distintas; export tem formato oficial do destino e metadata separada; preparação parcial não anunciada como publicável; adicionar futuro canal, inclusive Mercado Livre, sem copiar regras Amazon ou reescrever o core. |
| **S10-05 — Operar acessos e sincronização por conta/canal** | Backend/Infra: onboarding, refresh/revogação, quotas, mappings, estoque/preço com autoridade explícita e conflitos. | S10-04, S9-04. | Segredos por conta fora do browser; token expirado/revogado gera tarefa acionável; sync de um canal não altera outro indevidamente; moeda/logística/região explícitas; seller/shop ID em todo registro externo; polling/eventos conforme suporte oficial. |
| **S10-06 — Homologar o ciclo completo de cada marketplace** | QA/Operação/Sergio: catálogo de casos e gates por conector, não um único teste Amazon reaproveitado. | S10-05. | Pilotos autorizados para standalone/variantes/custom quando permitido; leitura→preparo→validação→review→publish→readback; respostas e erros reais; canal liberado individualmente; critério de pronto documentado. |

## S11 — Produção, worker, confiabilidade e segurança

| Story | Entrega e responsável | Dependências | Aceite e evidência |
| --- | --- | --- | --- |
| **S11-01 — Preparar staging/produção e configurar deploy** | Infra/Backend: hosting do Next, domínio/TLS, ambiente separado, runtime compatível e secrets. | S4-04; deploy exige decisão específica. | Staging/prod segregados; session/cookies corretos; service role/segredos não no bundle; rotas autenticadas; rollout/rollback testados; nenhuma migração executada implicitamente por build. |
| **S11-02 — Operar o worker como serviço durável** | Infra/Backend: processo supervisionado, concorrência, escala/quotas, cancelamento, heartbeats e poison jobs. | S8-05. | Reinício/queda retoma checkpoint; leases expiram sem processamento duplo; parada graciosa e cancelamento auditados; erro definitivo por item não bloqueia todo catálogo; métricas de throughput e custo. |
| **S11-03 — Implantar observabilidade e alertas úteis** | Infra/Frontend: logs sanitizados com correlation ID, dashboards/erros por SKU e alertas de ação. | S11-01, S11-02, S9-05. | Alertar fila parada, token inválido, rejeições/supressões e deriva de schema; sem notificações repetidas inúteis; sem token/PII em logs; evento liga job→SKU→request/feed→resultado; caminho de escalonamento definido. |
| **S11-04 — Garantir backup, restauração e recuperação** | Infra/QA: banco, assets/documentos, segredos e procedimentos para incidentes/outage. | S11-01. | Restore exercitado em ambiente separado; conteúdo/approval/ledger/mappings recuperados; RPO/RTO acordados e medidos; ausência de reenviar lote automaticamente após restore; conteúdo remoto reconciliado antes de retomada. |
| **S11-05 — Testar desempenho, limites e superfície de ataque** | QA/Infra: cargas de catálogo até o limite atual de 5.000 itens, SSRF, uploads, rate limit, auth e memória. | S7-06, S11-02. | Tempos/consumo medidos com meta operacional acordada; nenhum endpoint ignora teto de bytes usando só Content-Length; bloqueio de DNS/rebinding e redirects com credenciais revisado; segredo e permissões auditados; dependências e avisos críticos resolvidos. |
| **S11-06 — Estabelecer CI, migrations e releases verificáveis** | Infra/QA: testes de contrato/domínio/API/E2E, staging, tipos do banco, histórico de migrations e aprovação de release. | S4-06, S8-05, S11-01. | Histórico local/remoto reconciliado pelo nome/conteúdo antes de db push; drift e grants testados; contrato de canal validado com fixtures atuais; rollback e changelog; gates impedem release com falha crítica. |

## S12 — Marketing funcional, operação e aceite final

| Story | Entrega e responsável | Dependências | Aceite e evidência |
| --- | --- | --- | --- |
| **S12-01 — Homologar economia e fees por SKU** | Backend/Operação: custos, taxas estimadas/reais, frete, produção e margem, com fonte/data. | S4-05, S5-03, S6-03. | Product Fees usado quando aplicável; estimativa distinguida de taxa real; custos ausentes não viram zero; preço/estoque desatualizados bloqueiam decisão; margem recalculada auditavelmente por canal. |
| **S12-02 — Fechar Marketing Readiness e aprovação** | Frontend/Backend/QA: persistência real dos planos, claims, gates, revisores e invalidação por mudança relevante. | S12-01, S9-06. | Recarregar preserva planos/decisões; decisão mais recente válida governa readiness; aprovação de listing não aprova anúncios/gasto automaticamente; isolamento de SKU/organização comprovado. |
| **S12-03 — Validar tracking, pacotes e handoffs** | Backend/Marketing/QA: UTMs, outbound clicks, Attribution se elegível, export e Kanban controlado. | S12-02. | Destino e identidade do SKU corretos; evento de clique não apresentado como Purchase; Attribution só se liberado; pacote versionado e tarefa externa idempotente com autorização e readback. Nenhuma campanha paga criada por esta story. |
| **S12-04 — Treinar a equipe e tratar exceções** | Operação/Frontend: manual, responsabilidades, checklist técnico/documental e fluxo de suporte. | S8-06, S11-03, S12-02. | Operador real completa casos sem desenvolvedor; entende bloqueio de categoria/marca/GTIN/schema/mídia; consegue resolver, encaminhar ou excluir; manual de reautorização e recuperação validado. |
| **S12-05 — Fazer rollout do catálogo e medir cobertura** | Operação/QA/Sergio: lotes progressivos e reconciliação da população atual, com métricas por canal. | S9-06, S10-06 para cada canal habilitado, S11-04. | 100% dos registros atuais têm destino/status/motivo/responsável; nenhum elegível some por falha de importação; somente versões autorizadas enviadas; publicado reconciliado por canal; estoque/preço sincronizado só onde autorizado; manutenção pós-rollout demonstrada. |
| **S12-06 — Executar aceite operacional final** | Sergio/QA/Operação: auditar stories, KPIs, incidentes, restauração, contas e operação contínua. | Gates S4–S11 e S12-01–05. | Stories obrigatórias concluídas/homologadas, nenhum bloqueio crítico no escopo; todas as limitações/exceções explicitadas; matriz por canal assinada; documentação/status/evidências atualizados; Sergio confirma aceite. Não declarar 100% apenas porque testes/build passaram. |

## Checklist de liberação por canal

- [ ] Conta/aplicação/papéis/autorização válidos; secrets e refresh testados.
- [ ] Todos os registros do escopo contabilizados; fontes/identidades/famílias consistentes.
- [ ] Requisitos oficiais e condicionais aplicados; limitações manuais explicitadas.
- [ ] Fatos, marca/GTIN/isenção, documentos e mídia confirmados.
- [ ] Conteúdo adequado ao canal, sustentado e revisado na versão correta.
- [ ] Sessões, papéis, isolamento e gates provados em ambiente real.
- [ ] Piloto representativo e autorização específica de envio.
- [ ] Publicação e readback real; nenhum retry cego após resultado incerto.
- [ ] Filas, quotas, alertas, backup/restore, rollback e treinamento demonstrados.
- [ ] Catálogo reconciliado, exceções com responsáveis e aceite de Sergio registrado.

## Próximas histórias executáveis

1. **Conta:** S4-03 — criar/convidar usuário real no Supabase; depois aprovar o mapeamento S4-02.
2. **Conta:** S5-01/S5-02 — seguir `AMAZON-API-SETUP.md`, conferir Product Listing e gerar refresh token da aplicação correta.
3. **Backend/QA:** S4-04 e S5-03 — homologar sessão e leituras Amazon sem publicar.
4. **Operação:** S6-03/S8-01 — levantar fichas reais dos 20 casos piloto enquanto os acessos são liberados.

São tarefas planejadas e dependências concretas; não implicam autorização para criar usuários, expor deploy, contratar infraestrutura, alterar ofertas ou publicar todo o catálogo automaticamente.
