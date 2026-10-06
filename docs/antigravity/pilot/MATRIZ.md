# Piloto: proposta de seleção de 20 casos

Esta matriz contém cenários propostos, sem SKUs reais selecionados, versões autorizadas, usuários presumidos ou resultados aceitos. [Template JSON](casos-v1.json) permite preencher cada caso; [registro de treino](../training/SESSAO.md) registra a observação humana. Leia [operações](../../../OPERATIONS-005.md) e [incidentes](../training/INCIDENTES.md).

O piloto valida a jornada Amazon antes de expansão. Famílias podem consumir mais de um SKU por caso; 20 casos não significa 20 SKUs. Categorias/tipos elegíveis devem vir da loja e do contrato oficial atual. Cada envio exige autorização por todos os SKUs e suas versões, conta/marketplace e ação. Casos negativos não autorizam submissão inválida para produção: executar em ambiente isolado/preview conforme capacidade real.

| Caso | Cenário candidato | Resultado a observar | Etapa máxima sem autorização de publicação |
|---|---|---|---|
| P01 | Produto físico standalone com ASIN existente | Identidade exata revisada; conteúdo/conta/versão correspondem | Consulta/preparação/preview |
| P02 | Produto físico standalone com GTIN válido | Checksum e seleção oficial; fato GTIN comprovado | Consulta/preparação/preview |
| P03 | Candidato com isenção GTIN documentada | Isenção realmente aplicável à marca/categoria/conta | Preparação; não inferir isenção |
| P04 | Família pai + filhos elegíveis | Tema/marca/tipo/categoria compatíveis, manifesto/versionamento | Preparação/preview |
| P05 | Filho isolado com pai já existente | Readback do pai atual; aprovação/versionamento conjuntos | Consulta/preparação/preview |
| P06 | Customização elegível Amazon Custom FBM | Habilitação real, política/dados/customização revisados | Preparação/preview |
| P07 | Produto físico FBA elegível | Fulfillment e embalagem confirmados; PATCH estoque bloqueado | Preparação/preview |
| P08 | Serviço da fonte | Exclusão do fluxo físico registrada | Classificação local/exclusão |
| P09 | Fato físico/embalagem ausente | Pendência preservada, IA não inventa medição | Preparação bloqueada |
| P10 | Identificador ausente ou inválido | Bloqueio correto e encaminhamento de evidência | Validação negativa isolada |
| P11 | Família incompatível/marca ou tema divergente | Gate de família rejeita aprovação/envio | Validação negativa isolada |
| P12 | Requisito oficial condicional ou schema vencido | Atualização/revalidação e nova revisão necessárias | Consulta/preparação/preview |
| P13 | Copy com referência externa ou claim não comprovado | Grounding/edição/revisão impedem claim sem evidência | Avaliação offline/preview |
| P14 | Imagem/documento privado pendente | Scanner, direitos e fidelidade comprovados antes da liberação | Preparação bloqueada |
| P15 | Alteração da fonte após preparação | Diff e decisão motivada sem overwrite silencioso | Reconciliação da fonte |
| P16 | Mudança de versão após aprovação | Aprovação antiga/manifesto obsoleto recusados | Validação de conflito isolada |
| P17 | Lote interrompido/cancelado e retomada | Cursor/resultados preservados; item concluído não repetido | Job seguro isolado |
| P18 | Feed/envio incerto e reconciliação | Nenhum reenvio automático; readback/relatório por mensagem | Monitor/ensaio isolado |
| P19 | Atualização FBM preço/estoque autorizada | Autoridade/campos/validade/custo e versão conferidos | Preparação de PATCH |
| P20 | BUYABLE + economia + marketing, depois prova vencida | Estado atual, custos reais USD, handoff revisado e refresh exigido | Consulta/handoff sem gasto |

## Registrar antes da execução

Para cada caso, a FBR seleciona produto(s), responsável, evidência factual, categoria/schema oficial vigente, fulfillment, identidade e autorização de ambiente/ação. Registrar `content_hash`, `updated_at`, seller/account e marketplace antes do envio. Copiar dados mínimos para staging conforme autorização e privacidade; não copiar secrets ou fichas privadas para artefatos públicos.

Casos podem permanecer bloqueados por inexistência de candidato elegível ou infraestrutura. Não fabricar produtos para preencher diversidade. Fixtures podem verificar contrato local, mas recebem resultado `fixture_local` e não `homologado_real`.

## Critérios de aceite a validar pela FBR

Todos os casos selecionados devem registrar resultado observado versus esperado, evidência, erros e correções. Casos negativos devem bloquear a etapa esperada; casos de envio autorizado exigem comprovação externa da versão correta, não apenas HTTP 2xx. Pendências e exceções precisam de responsáveis reais e decisão documentada. A FBR decide expansão por lotes após analisar evidências e dados reais; esta matriz não define metas numéricas de qualidade, tempo ou taxa de erro que não tenham sido acordadas.

## Expansão por canal

eBay standalone implementado exige piloto próprio de conta/políticas/inventário/oferta/readback; recuperação de offerId não é comprovação de propriedade automática. Família eBay, Walmart payload/feed e TikTok dependem de contratos/acessos vigentes. Não usar piloto Amazon para declarar esses canais homologados. Preparar configurações/contratos em código não habilita publicação real.
