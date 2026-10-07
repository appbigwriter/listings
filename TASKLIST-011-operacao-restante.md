# Tasklist 011 — fechamento operacional do PreListing

Atualizada em 06/10/2026 a partir do código, evidências locais e do backlog S4–S12. Esta lista substitui uma leitura binária de “feito/não feito”: **implementado e testado localmente** não significa **homologado em conta, dados e ambiente reais**.

## Situação verificada

- A base Supabase possui 26 migrations aplicadas, inclusive jobs de refresh de schema, incidentes, reservas de famílias eBay, limite/claim Walmart, eventos Amazon e view de última submissão. Falta a verificação final de deriva após as migrations 24–26.
- O core de catálogo, revisão por versão, filas/checkpoints, Amazon, eBay standalone/famílias, Walmart inicial, polling somente leitura, IA avaliada em corpus sintético e marketing persistente estão implementados localmente.
- O projeto passou por typecheck, build, `npm audit` e 351 testes em 82 arquivos após a última alteração.
- Não há usuários reais no Auth, os dois registros legados continuam sem owner/organização, o token Amazon ainda retornou `invalid_grant`, e nenhum listing, anúncio ou gasto foi publicado.

## Atualização de execução — 06/10/2026

- [x] T-001 — migration `20261006230305_amazon_schema_event_refresh_all` aplicada: eventos Amazon fazem fanout para todos os listings Amazon US ativos/classificados; jobs pendentes de notificações antigas são coalescidos sem tocar em jobs manuais ou em execução.
- [x] T-002 — deriva remota confirmada em transação somente leitura: 27 migrations, 13 funções, 11 tabelas com RLS e a view privada de polling com `security_invoker`/grants de serviço.
- [x] T-003 — recuperação Walmart para `feedId` perdido foi adicionada com manifesto SKU/GTIN, conta, janela temporal, CAS e atestação administrativa. Ela preserva `unknown` e `not_verified`.
- [x] T-004 — a tela de marketing bloqueia custos e decisões enquanto houver operação em voo; ações de geração também respeitam edição pendente.
- [x] T-005 — validação integrada aprovada: 351 testes/82 arquivos, typecheck, build, integridade de migrations e `npm audit` sem vulnerabilidades.
- [x] T-006 — tasklist e registro de execução atualizados com estado técnico e limitações de homologação.
- [x] T-106 — serviço `poller` opt-in adicionado ao compose; o intervalo permanece `0` até configuração operacional.
- [~] T-101 — registro multi-conta, RLS e API administrativa foram adicionados na migration `20261006231324_marketplace_account_registry`; a injeção efetiva de credenciais por cofre e a seleção dinâmica pelos executores dependem do provedor de cofre/contas reais.

## P0 — fechar consistência técnica antes de qualquer piloto

- [x] **T-001 — Corrigir o fanout de eventos Product Type Definitions.** Migration aplicada e regressão PGlite aprovada.
- [x] **T-002 — Verificar migrations 24–26 em remoto.** Snapshot sanitizado e contrato de drift atualizados.
- [x] **T-003 — Fechar a recuperação Walmart de submissão incerta.** Associação auditada implementada sem descoberta/reenvio/publicação.
- [x] **T-004 — Completar isolamento de concorrência na tela de marketing.** Operações concorrentes ficam bloqueadas durante geração/revisão.
- [x] **T-005 — Repetir a validação integrada.** 351 testes, typecheck, build, integridade de migrations e audit aprovados.
- [x] **T-006 — Atualizar documentação de execução.** Tasklist e registro de execução atualizados sem alegar homologação de produção; board operacional segue como referência de entregas paralelas.

## P1 — completar os itens ainda provisionáveis em código

- [~] **T-101 — Onboarding multi-conta por canal.** Registro server-side, RLS e API administrativa prontos; falta conectar o cofre e os executores às contas reais.
- [ ] **T-102 — Estados de credencial e revogação.** Centralizar token inválido, refresh falho, escopo insuficiente e rate limit como incidentes acionáveis por conta; impedir novo write para a conta afetada e preservar monitoramento somente leitura quando seguro.
- [ ] **T-103 — Completar adaptador TikTok após contrato oficial.** Implementar somente depois de receber versão, OpenAPI/SDK oficial, hosts, paths, identidade da loja e mecanismo de refresh. O código de signing já existe; faltam parser de token, mapper de categorias/atributos, ledger, revisão, monitor e readback.
- [ ] **T-104 — Completar readback Walmart.** Consumir contrato oficial de Get Item/Offer para comprovar conta, SKU, atributos da versão e disponibilidade. Até isso existir, status de processamento permanece `accepted`/`not_verified`.
- [ ] **T-105 — Evoluir manutenção eBay.** Cobrir alteração de famílias/ofertas existentes, atualização controlada de preço/estoque e recuperação com provas externas, sempre sem replay automático de writes incertos.
- [x] **T-106 — Tornar o scheduler operável.** Perfil `scheduler`/serviço `poller` com healthcheck, segredo runtime e intervalo desligado por padrão.
- [ ] **T-107 — Completar observabilidade operável.** Conectar incidentes internos a um destino autorizado, com deduplicação/escalonamento; manter logs sem payloads, tokens ou PII. A criação de Slack/e-mail/PagerDuty depende da escolha do destino pelo responsável.
- [ ] **T-108 — Fortalecer o verificador de release.** Exigir evidências frescas de build de imagem, scanner, restore, staging e destinos antes de permitir uma candidatura a release; continuar sem deploy automático.

## P2 — dependências externas que precisam ser entregues à operação

- [ ] **E-201 — Identidades e organização reais.** Informar e-mails, papéis e organização; definir owner dos dois registros legados. Em seguida criar convites, completar senha/SMTP e executar E2E com dois tenants isolados.
- [ ] **E-202 — Credenciais Amazon SP-API.** Fornecer aplicação privada aprovada, refresh token válido, seller ID e marketplace US. Confirmar Product Listing, Product Type Definitions, Feeds, Notifications e permissões de leitura antes de habilitar qualquer write.
- [ ] **E-203 — Fatos comerciais e físicos.** Para o piloto: marca, GTIN/isenção, país de origem, dimensões/peso/embalagem, materiais, compliance/certificados, custo/preço/frete e imagens/documentos realmente aprovados.
- [ ] **E-204 — Piloto de 20 casos.** Selecionar SKUs representativos, incluindo variantes/famílias/personalizados/serviços excluídos; preencher dados, rodar preview real e registrar o resultado por SKU.
- [ ] **E-205 — Autorização explícita de versões.** Depois de S8, registrar quais SKUs e hashes podem ser enviados. Sem isso, os toggles de publicação continuam desligados.
- [ ] **E-206 — Contas e contratos eBay/Walmart/TikTok.** Fornecer grants/contas, account/partner/shop IDs, política logística, spec/OpenAPI vigente e ambiente de piloto. Cada canal será homologado independentemente.
- [ ] **E-207 — Infraestrutura.** Escolher hosting/staging, domínio/TLS, cofre de segredos, destino de logs/alertas, AWS SQS/EventBridge para Amazon e estratégia de backup/PITR/retention. Docker local não está disponível neste host, portanto imagem/scanner/restore reais aguardam esse ambiente.
- [ ] **E-208 — Treinamento e aceite.** Executar o guia operacional com responsáveis reais, ensaiar recuperação em ambiente separado, medir RPO/RTO, revisar exceções e registrar aceite final.

## Gates de liberação

| Gate | Critério objetivo | Estado |
| --- | --- | --- |
| G1 — integridade técnica | T-001 a T-006 concluídas e validação final verde | pendente |
| G2 — acesso seguro | E-201 e E-202 concluídos; leitura Amazon com identidade correta | bloqueado por dados externos |
| G3 — piloto | E-203 e E-204 concluídos; 20 resultados rastreáveis | bloqueado por dados externos |
| G4 — publicação controlada | E-205, reserva persistente e readback por SKU | bloqueado por autorização/piloto |
| G5 — produção | E-207/E-208, restore ensaiado, alertas e release gate verde | bloqueado por infraestrutura/operação |

## Ordem recomendada de execução

1. T-001 a T-006.
2. T-101, T-102, T-104 a T-108 em paralelo com a coleta de E-201 a E-207.
3. E-201/E-202, seguido do piloto E-203/E-204.
4. T-103 somente após contrato TikTok oficial; T-105 após conta eBay homologável.
5. E-205 e G4; por fim E-208 e G5.

Itens externos não bloqueiam o avanço dos itens de código acima, mas bloqueiam a alegação de que o sistema está homologado ou pronto para publicação real.
