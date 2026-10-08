# Sprints e Stories — Nova Central de Preparação

**Origem:** [PRD da Central de Preparação](./PRD-CENTRAL-PREPARACAO-ADAPTACAO.md)  
**Data:** 08/10/2026  
**Estado:** backlog de implementação  
**Princípio:** o sistema prepara dados; pessoas resolvem somente exceções sustentadas por evidência.

## Convenções

Estados: `planejada`, `em_execucao`, `bloqueada`, `implementada_localmente`, `homologada`, `concluida`.

Definition of Done comum:

- código, migration e tipos consistentes quando houver mudança de banco;
- RLS, grants e isolamento por organização/owner verificados;
- testes de domínio e integração adequados;
- eventos e jobs idempotentes, sem repetição cega de writes externos;
- evidência sanitizada, sem segredos ou fatos físicos inventados;
- interface acessível, com estado de carregamento, erro e conflito de versão.

Nenhuma story autoriza publicação real, criação de anúncios ou uso de dados físicos/comerciais não confirmados.

---

## Sprint P0 — Fundação de dados, segurança e migração da Central

**Objetivo:** preparar o banco para estados por campo, exceções agrupadas, regras reutilizáveis e impacto, sem substituir prematuramente o fluxo atual.

| ID | Story | Entrega | Critério de aceite | Dependências |
| --- | --- | --- | --- | --- |
| P0-01 | Inventário e contrato de dados atual | Mapear `prelistings`, `_catalog`, fatos, famílias, jobs, aprovações, submissions e contas; definir o contrato canônico sem duplicar campos existentes. | Documento de mapeamento com origem, dono, versão, consumidor e plano de migração de cada dado. | PRD |
| P0-02 | Estados por campo | Criar estrutura versionada para `confirmed`, `suggested`, `inherited`, `not_found`, `conflicting` e `not_applicable`, com origem, confiança, evidência e data. | Um campo pode ter estado, valor, fonte e histórico sem alterar o valor aprovado por engano. | P0-01 |
| P0-03 | Registro de exceções | Criar tabelas/RPCs para exceções: código, campo, canal, escopo, severidade, ação, responsável, estado e versão observada. | Exceção é deduplicada e não pode ser fechada por leitura parcial da população. | P0-02 |
| P0-04 | Agrupamento e impacto | Criar grupos de exceções por causa raiz e relação com SKUs/famílias/regras; calcular produtos desbloqueáveis. | Um grupo mostra população completa, estado e impacto reprodutível; mudanças concorrentes não perdem membros. | P0-03 |
| P0-05 | Regras reutilizáveis | Persistir regras nos escopos global, família e produto, com precedência, evidência, aprovação, validade e simulação de impacto. | Regra não sobrescreve exceção local sem decisão explícita; preview mostra SKUs afetados. | P0-02, P0-04 |
| P0-06 | Herança de família | Modelar vínculo pai/filho e fatos herdáveis, preservando diferenças de variante e autoridade do filho. | Uma alteração de família recalcula apenas membros aplicáveis e mantém overrides rastreáveis. | P0-01, P0-05 |
| P0-07 | Prontidão por canal versionada | Persistir cálculo explicável de readiness por SKU/canal, bloqueios, próxima ação, schema e hash de insumos. | Estados `draft` a `not_verified` são derivados de dados atuais e não confundem aceitação com publicação. | P0-02, P0-03 |
| P0-08 | Segurança, RLS e migração | Aplicar migrations aditivas, RLS/grants, índices, tipos gerados, manifesto e verificação de drift. | Usuário só lê o próprio escopo; service role possui somente permissões necessárias; rollback documentado. | P0-02 a P0-07 |
| P0-09 | Backfill seguro | Converter gradualmente registros existentes em estados/fatos/exceções sem criar fatos novos. | Dry-run mostra alterações; backfill é idempotente, paginado e preserva legados sem owner/org. | P0-08 |

**Gate P0:** schema local/remoto alinhado, RLS verificado, backfill em dry-run aprovado e editor atual continua funcional.

---

## Sprint P1 — Motor de fatos e preparação automática

**Objetivo:** transformar fontes existentes em fatos estruturados e propostas de IA rastreáveis.

| ID | Story | Entrega | Critério de aceite | Dependências |
| --- | --- | --- | --- | --- |
| P1-01 | Pipeline de extração da fonte | Extrair título, descrição, variantes, preço, mídia, coleções e metadados da fonte para fatos estruturados. | Cada fato aponta à fonte, trecho/chave e hash da importação. | P0 |
| P1-02 | Normalização de atributos | Normalizar unidades, medidas, cores, materiais, marca, conteúdo do kit e campos técnicos sem substituir o original. | Valor normalizado conserva valor bruto, unidade/origem e incerteza. | P1-01 |
| P1-03 | Propostas de IA com grounding | IA propõe fatos, categoria e conteúdo somente a partir de evidências e regras disponíveis. | Proposta sem evidência vira `suggested` ou `not_found`, nunca `confirmed`. | P1-01, P1-02 |
| P1-04 | Resolução de conflito | Detectar fontes incompatíveis e abrir exceção explicável em vez de escolher silenciosamente. | Conflito mostra valores, fontes, confiança e decisão necessária. | P1-03 |
| P1-05 | Templates de produto | Regras reutilizáveis por tipo de placa, coleção, material e família, com prioridade clara. | Template acelera preenchimento sem mascarar exceções individuais. | P0-05, P1-02 |
| P1-06 | Qualidade e corpus | Expandir corpus com fatos, conflitos, famílias e recusas; medir precisão por tipo de dado. | Relatório separa avaliação sintética de amostra humana anotada. | P1-03 |

**Gate P1:** a importação gera fatos, sugestões e exceções explicáveis para uma amostra representativa sem preenchimento manual campo a campo.

---

## Sprint P2 — Requisitos oficiais e prontidão por canal

**Objetivo:** converter fatos em requisitos concretos da Amazon e demais canais, sem expor schemas brutos ao operador.

| ID | Story | Entrega | Critério de aceite | Dependências |
| --- | --- | --- | --- | --- |
| P2-01 | Matriz de requisitos Amazon | Traduzir schema Amazon em requisitos legíveis, condicionais e acionáveis. | Cada requisito informa campo, motivo, severidade, evidência e próxima ação. | P0-07, acesso Amazon |
| P2-02 | Adaptador de requisitos eBay | Expor taxonomy/aspects/policies como requisitos de negócio e não JSON técnico. | Famílias e aspectos condicionais apontam exceções específicas. | P0-07, conta eBay |
| P2-03 | Adaptador de requisitos Walmart | Usar Get Spec para requisitos, feed e readback com estados corretos. | Sucesso de ingestão não é mostrado como publicação. | P0-07, conta Walmart |
| P2-04 | Contrato TikTok Shop | Integrar somente após OpenAPI/SDK/conta/versão oficial; converter requisitos para o mesmo modelo. | Sem contrato oficial, canal fica bloqueado com motivo explícito. | P0-07, contrato TikTok |
| P2-05 | Refresh de schemas | Eventos e polling atualizam requisitos, invalidam prontidão e criam exceções agrupadas. | Mudança de schema não permite exportação com versão antiga. | P0-07 |
| P2-06 | Motor de próximo passo | Priorizar cada bloqueio por impacto, risco, vencimento de schema e canal. | Cada SKU e grupo tem uma ação recomendada determinística. | P2-01 a P2-05 |

**Gate P2:** o sistema explica prontidão e bloqueios de um SKU por canal sem exigir que o operador leia o schema oficial bruto.

---

## Sprint P3 — Fila de exceções e regras compartilhadas

**Objetivo:** substituir o trabalho campo a campo por decisões de maior impacto.

| ID | Story | Entrega | Critério de aceite | Dependências |
| --- | --- | --- | --- | --- |
| P3-01 | Tela de fila priorizada | Lista de exceções por impacto, canal, tipo, responsável, idade e risco. | A primeira ação recomendada desbloqueia o maior impacto conforme filtros ativos. | P0-04, P2-06 |
| P3-02 | Resolução mínima | Formulários pequenos para confirmar, corrigir, rejeitar, adiar e atribuir exceção. | Decisão requer evidência quando o campo é crítico e cria auditoria. | P3-01 |
| P3-03 | Aplicação por escopo | Operador escolhe produto, família ou regra; sistema mostra preview antes de propagar. | Não há propagação silenciosa; overrides locais continuam preservados. | P0-05, P0-06 |
| P3-04 | Conflitos e colaboração | Atribuição, comentários, bloqueio otimista e detecção de edição concorrente. | Dois operadores não conseguem fechar a mesma versão com decisões divergentes sem conflito explícito. | P3-02 |
| P3-05 | Exceções de mídia e documentos | Integrar scanner, qualidade de mídia, direitos e certificados à mesma fila. | Falha de scanner ou evidência vencida informa ação e impede uso indevido. | P0-03 |
| P3-06 | Operação em lote | Ações em lote para exceções homogêneas, com preview, limite, confirmação e resultados por item. | Lote não altera SKUs fora do preview nem oculta falhas parciais. | P3-01 a P3-05 |

**Gate P3:** um operador consegue desbloquear uma família ou regra inteira pela fila, sem visitar cada SKU individualmente.

---

## Sprint P4 — Central, produto e família

**Objetivo:** entregar a nova experiência de trabalho baseada em cobertura, exceções e impacto.

| ID | Story | Entrega | Critério de aceite | Dependências |
| --- | --- | --- | --- | --- |
| P4-01 | Dashboard de preparação | Cobertura, prontidão por canal, principais bloqueios, famílias e recomendação de próximo trabalho. | Todos os números abrem filtros coerentes e usam população completa/paginada. | P0-07, P3-01 |
| P4-02 | Detalhe de produto orientado a estado | Resumo de prontidão, fatos, heranças, variantes, requisitos, conteúdo e histórico. | Tela começa pelo que bloqueia; editor técnico fica secundário. | P1, P2, P3 |
| P4-03 | Detalhe de família | Visualização de pai/filhos, eixos, fatos compartilhados, overrides e impacto. | Alteração de família mostra variantes afetadas antes de salvar. | P0-06 |
| P4-04 | Visualização de origem | Interface para fonte, evidência, confiança e diffs de IA. | Usuário consegue entender por que um valor foi proposto ou bloqueado. | P1-03 |
| P4-05 | Acessibilidade e recuperação | Estados de loading/erro, navegação por teclado, mensagens de conflito e retomada segura. | Fluxos críticos passam em testes de interação e markup acessível. | P4-01 a P4-04 |
| P4-06 | Migração de interface | Manter links e editor existente em modo de contingência durante rollout. | Usuário pode voltar ao detalhe antigo sem perder contexto ou alterações. | P4-02 |

**Gate P4:** operação diária começa pela Central e pela fila, não pelo editor de SKU.

---

## Sprint P5 — Revisão, lotes e publicação controlada

**Objetivo:** levar produtos prontos até a aprovação e submissão sem reintroduzir trabalho manual ou risco de duplicação.

| ID | Story | Entrega | Critério de aceite | Dependências |
| --- | --- | --- | --- | --- |
| P5-01 | Formação de lotes prontos | Criar lotes por canal, família, prioridade e estado de prontidão. | Produtos bloqueados não entram; critérios do lote ficam registrados. | P2, P3 |
| P5-02 | Revisão por diferença | Comparar versão atual, última aprovada e payload do canal. | Revisor aprova apenas campos/versões visíveis; mudança relevante invalida aprovação. | P5-01 |
| P5-03 | Exportação por lote | Gerar pacotes oficiais e relatórios por SKU/família, com hash/manifesto. | Export não é confundido com publicação; arquivo corresponde à versão aprovada. | P5-02 |
| P5-04 | Autorização de publicação | Registrar SKUs/versões/canais autorizados antes do write externo. | Tentativa fora da autorização é bloqueada e auditada. | P5-02 |
| P5-05 | Reconciliação e readback | Associar resposta externa ao SKU/versão e distinguir submitted, accepted, published e not_verified. | Resposta incerta não permite retry automático; recuperação é auditada. | P5-04 |
| P5-06 | Monitoramento pós-publicação | Exibir issues, supressões, schema drift e necessidade de nova revisão. | Parent, FBA/FBM e estado comprável são tratados de forma correta. | P5-05 |

**Gate P5:** piloto autorizado consegue percorrer preparação → revisão → submissão → readback sem duplicar write externo.

---

## Sprint P6 — Aprendizado operacional e escala

**Objetivo:** reduzir continuamente exceções e operar com segurança em catálogo completo.

| ID | Story | Entrega | Critério de aceite | Dependências |
| --- | --- | --- | --- | --- |
| P6-01 | Sugestão de regras | Detectar resoluções repetidas e sugerir regras candidatas. | Nenhuma regra é aplicada automaticamente sem escopo/evidência/aprovação. | P3 |
| P6-02 | Métricas de automação | Medir cobertura, preenchimento automático, taxa de exceção, tempo até revisão e retrabalho. | Métricas distinguem dados sugeridos, confirmados e publicados. | P4, P5 |
| P6-03 | Ownership de exceções | SLA, fila por responsável, vencimento e escalonamento interno configurável. | Exceção crítica sem dono aparece como incidente; sem envio externo sem destino autorizado. | P3-04 |
| P6-04 | Performance de catálogo | Carga até 5.000 itens, paginação, filtros, agregações e processamento em lote. | Limites e degradação são mensurados; nenhuma consulta parcial fecha exceções. | P4, P5 |
| P6-05 | Piloto de 20 casos | Executar matriz de casos reais, fatos, schemas, revisão e readback. | Resultado por SKU e decisão de expansão documentados. | acessos e dados reais |
| P6-06 | Rollout completo | Expansão progressiva por canal/categoria, com kill switch e rollback operacional. | Canal só expande após critérios de qualidade, operação e recuperação aprovados. | P6-05 |

**Gate P6:** a operação possui métricas, processo de melhoria e critérios para expandir sem transformar exceções em trabalho manual massivo.

---

## Dependências externas transversais

| Dependência | Stories afetadas | Necessário para |
| --- | --- | --- |
| Usuários, papéis e organização reais | P0, P3 a P6 | Homologação RLS, colaboração e auditoria real. |
| Token Amazon e permissões SP-API | P2, P5, P6 | Schemas, preview, publicação e readback reais. |
| Conta/contrato eBay, Walmart e TikTok | P2, P5, P6 | Homologação específica por canal. |
| Fatos, documentos e mídia dos produtos | P1 a P6 | Resolver exceções reais e conduzir piloto. |
| Cofre de segredos e staging | P0, P5, P6 | Contas reais, deploy, restore e operação segura. |
| Autorização de versões/SKUs | P5, P6 | Qualquer write externo. |

## Sequência recomendada

1. P0 integralmente, incluindo migration/backfill em dry-run.
2. P1 e P2 em paralelo onde o contrato oficial do canal estiver disponível.
3. P3 antes de substituir qualquer tela existente.
4. P4 com rollout em leitura e grupos de operadores.
5. P5 somente para piloto autorizado.
6. P6 após evidência do piloto e ambiente operacional estável.

## Backlog inicial priorizado

1. P0-01 a P0-09.
2. P1-01, P1-03, P2-01 e P2-06.
3. P3-01, P3-02 e P3-03.
4. P4-01 e P4-02.
5. P5-01 e P5-02.

Essa ordem produz valor cedo: a equipe passa a enxergar causas e impacto antes de qualquer redesenho completo de tela ou publicação.
