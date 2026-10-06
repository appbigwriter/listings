# AG-01 — complemento navegador

Harness Playwright1.63.0 preparado em `playwright.antigravity.config.ts`, `scripts/antigravity/e2e/browser-guard.ts` e `tests/antigravity/e2e/browser/`. Sem criação automática de servidor/identidades, seeds produtivos, service key ou publicação. Dois smoke readonly medem login acessível e401 de sessão fresca para catálogo/jobs/export.

Evidência integrada: `artifacts/antigravity/AG-01-browser/playwright-results.json` registra **2 expected/0 unexpected** em 06/10/2026, Chrome headless real contra preview isolado33100 fornecido pelo coordenador. A primeira tentativa do agente em3100 retornou ECONNREFUSED, pois o servidor antigo estava ausente; ela não comprova regressão do login e foi substituída pelo ensaio33100 autorizado. Nenhuma credencial foi submetida nos smoke.

Jornadas autenticadas futuras estão implementadas: UI login/criação draft, PATCH/CAS, review/export prematuros bloqueados, isolamento entre2tenants, arquivamento do draft de teste, revisão/export de fixture qualificada e invalidação após editar. **Não executadas:** precisam de duas identidades existentes autorizadas em projeto isolado e produto qualificado real do ensaio. Nenhum fato físico real ou usuário produtivo foi inventado.

Config exige `ANTIGRAVITY_E2E_MODE=authenticated`, base exclusiva `http://127.0.0.1:33100` e `ANTIGRAVITY_E2E_FIXTURE_FILE` absoluto fora do checkout. JSON contém `isolated:true`, `authorized_test_identities:true`, `checked_at` fresco≤24h, `base_url`, `supabase_project_ref` (20 caracteres, refs produção/source conhecidas recusadas), `publication_enabled:false`, `external_writes_blocked:true`, `run_id` UUID, `tenant_a`/`tenant_b` com email/password/org distintos e `qualified_ready_sku` prefixoAG01-E2E-. Atestação deve ser produzida pelo operador do servidor isolado; o guard não pode provar configuração interna do servidor a partir de declarações arbitrárias.

Credenciais ficam fora do checkout/cofre local. Trace/screenshot/video desligados para evitar gravar formulário/password. Browser bloqueia destinos externos, mas o servidor também precisa de transporte externo bloqueado e flags de publicação desligadas: browser routing sozinho não controla egress do backend. Status API verifica flags antes da jornada. Tenants precisam de papel admin/reviewer; fixture qualificada deve ser exclusiva e descartável, sem listings publicados. A jornada positiva deixa o título alterado e approval invalidado deliberadamente; restaurar fixture pelo procedimento isolado antes de repetir. Draft automático é arquivado com motivo e versão; não apagado.

Comandos:

```powershell
node --import=tsx scripts/antigravity/e2e/browser-guard-check.ts
$env:ANTIGRAVITY_E2E_MODE='smoke-readonly'
$env:ANTIGRAVITY_E2E_BASE_URL='http://127.0.0.1:33100'
$env:ANTIGRAVITY_E2E_CHROME_PATH='CAMINHO-DO-CHROME-INSTALADO'
npx playwright test --config playwright.antigravity.config.ts
```

Modo smoke3100 permite somente os dois testes de GET e bloqueia POST/PUT/PATCH/DELETE no contexto browser; não seleciona jornadas autenticadas. Modo autenticado33100 falha antes de criar browser se manifest/identidades/qualified fixture não fornecidos. Guard-check usa objetos sintéticos em memória exclusivamente para regressão de configuração, sem criar usuários.

Restart/leases/crash têm evidências próprias AG-05 de dois processos/PGlite; não são declarados como homologação de supervisor real nem prova de ownership de staging. Coordenador mantém esse gate fora da jornada de navegador. Typecheck/build/suíte final central; sem alteração package/core pelo agente.
