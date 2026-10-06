# AG-01 — revisão do coordenador

05/10/2026. Entrega parcial encontrada no checkout; sem relatório original e sem identificação da baseline da execução externa. Não houve despacho automático nesta conversa.

Integrados testes locais de módulos e de schema PGlite. Fila/cancelamento/retry corrigidos para kind/status/total/cursor/idempotency_key/payload reais; removida a suposição incorreta de que jobs de preparação geram submissões. Testes de ambiente usam restauração após cada teste e stubEnv compatível com TypeScript. Comparação de hashes fictícios substituída por snapshots de produto alterado.

Harness agora roda a suite e registra resultado observado; a versão recebida só escrevia um JSON de sucesso. fetch é bloqueado pela configuração de teste. Último resultado: 19 regressões de contrato, zero falhas, 20 migrations locais; artifacts/antigravity/AG-01/test-summary.json.

Pendências: servidor/browser isolado, journeys HTTP/UI, refresh/revogação real, dois usuários, restart de worker e demonstração de isolamento dos demais transportes. Esses testes não são homologação E2E; AG-01 não está integralmente aceito. Escopos AG-02/05 seguem os gates originais. Alterações compartilhadas continuam com Codex.

Configuração Playwright corrigida para não descobrir testes Vitest e não reutilizar o servidor 3100 com secrets herdados. Exige servidor isolado explícito em 33100, com isolamento/provisionamento demonstrados antes de iniciar jornadas browser/*.spec.ts. Não executada nesta revisão.
