# Matriz de Cobertura E2E — Pacote AG-01

Data: 05/10/2026
Pacote: AG-01 (Harness E2E e regressões das jornadas)
Stories Relacionadas: S4-04, S4-05, S8-05, S12-02

## 1. Mapeamento de Cenários e Testes

| Story | Requisito Crítico | Teste Implementado | Resultado |
|---|---|---|---|
| **S4-04** | RBAC para Operador, Revisor e Administrador | `tests/antigravity/e2e/auth-journey.e2e.test.ts` | Aprovado |
| **S4-04** | Validação estrita de assinatura HMAC em trusted gateway | `tests/antigravity/e2e/auth-journey.e2e.test.ts` | Aprovado |
| **S4-04** | Bloqueio de fail-closed em modo local-only em produção | `tests/antigravity/e2e/auth-journey.e2e.test.ts` | Aprovado |
| **S4-05** | Isolamento multi-tenant de produtos e prelistings por owner/org | `tests/antigravity/e2e/multi-tenant-isolation.e2e.test.ts` | Aprovado |
| **S4-05** | FKs compostas impedindo inserção de filho de outro tenant | `tests/antigravity/e2e/multi-tenant-isolation.e2e.test.ts` | Aprovado |
| **S8-05** | Criação atômica de lotes de submissão por tenant | `tests/antigravity/e2e/catalog-jobs-and-cancellation.e2e.test.ts` | Aprovado |
| **S8-05** | Cancelamento atômico de jobs e bloqueio de checkpoint cancelado | `tests/antigravity/e2e/catalog-jobs-and-cancellation.e2e.test.ts` | Aprovado |
| **S8-05** | Retomada idempotente de falhas preservando histórico | `tests/antigravity/e2e/catalog-jobs-and-cancellation.e2e.test.ts` | Aprovado |
| **S12-02** | Selo HMAC com verificação de moeda da aprovação | `tests/antigravity/e2e/marketing-review-and-invalidation.e2e.test.ts` | Aprovado |
| **S12-02** | Invalidação automática por alteração de preço do produto | `tests/antigravity/e2e/marketing-review-and-invalidation.e2e.test.ts` | Aprovado |
| **S12-02** | Invalidação automática por alteração de proveniência de custos | `tests/antigravity/e2e/marketing-review-and-invalidation.e2e.test.ts` | Aprovado |
| **S12-02** | Invalidação automática por alteração de planos/tracking | `tests/antigravity/e2e/marketing-review-and-invalidation.e2e.test.ts` | Aprovado |
| **S12-02** | Detecção de conflito de versão (CAS / `expected_hash`) | `tests/antigravity/e2e/marketing-review-and-invalidation.e2e.test.ts` | Aprovado |
| **Segurança** | Bloqueio estrito de chamadas reais a marketplaces no harness | `tests/antigravity/e2e/external-calls-safety.e2e.test.ts` | Aprovado |
| **Segurança** | Filtro de SSRF, metadados AWS e IPv6 mapeados | `tests/antigravity/e2e/external-calls-safety.e2e.test.ts` | Aprovado |

## 2. Isolamento e Contratos

- **Nenhum segredo de produção** utilizado no harness.
- **Nenhum atalho de autenticação** adicionado ao código produtivo.
- **Ambiente descartável**: Testes de banco utilizam PGlite em memória carregando as 19 migrations oficiais.
- **Preservação de Gates**: Todos os 177 testes existentes da baseline foram executados e continuam passando integralmente.
