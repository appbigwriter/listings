# AG-04: ambiente descartável e recuperação

Este pacote prepara execução; não ativa staging nem altera produção. Compose usa o projeto `prelisting-ag04`, porta web exclusiva `127.0.0.1:33100`, volumes próprios e rede interna de scanner/banco. Scanner também participa de rede de saída para FreshClam; nenhuma porta 3310 é publicada. O daemon clamd não possui autenticação adequada para exposição pública. Antes de ativar num host compartilhado, verificar que nenhum projeto usa o mesmo nome/porta; não remover recursos existentes para liberar o ensaio.

## Verificação sem Docker Engine

```powershell
node scripts/antigravity/infra/config-check.mjs
node --import=tsx scripts/antigravity/infra/scanner-check.mjs
```

A primeira verifica o modelo efetivo do Compose e o bootstrap de secrets. A segunda usa servidores TCP descartáveis ligados a localhost e chama o scanner verdadeiro da aplicação: limpo, rejeitado, base vencida, resposta incompleta e indisponível. Isso comprova o contrato e os bloqueios, sem comprovar detecção do motor ClamAV. Nenhum arquivo é enviado ao Supabase.

## Scanner real, quando o daemon estiver disponível

```powershell
docker compose -f compose.antigravity.yaml build worker
docker compose -f compose.antigravity.yaml up -d --wait scanner
docker compose -f compose.antigravity.yaml --profile app run --rm --no-deps --entrypoint node worker --import=tsx scripts/antigravity/infra/scanner-check.mjs --live
```

O teste real aceita conteúdo inofensivo e exige rejeição do texto de teste EICAR em memória. Não grava EICAR em disco. FreshClam roda na imagem oficial e persiste assinaturas no volume dedicado. A saúde do container prova disponibilidade; o código exige versão e assinaturas com no máximo 72 horas antes de liberar o arquivo. O primeiro download e o consumo de RAM precisam ser medidos no host escolhido. Referência: [ClamAV Docker](https://docs.clamav.net/manual/Installing/Docker.html).

## Banco e backup/restore exclusivamente sintéticos

```powershell
docker compose -f compose.antigravity.yaml --profile restore run --rm restore-check
```

O único alvo permitido pelo script é `restore-db`, usuário/database `ag04_fixture`. Não aceita URLs, nomes de produção ou backups externos. Gera `pg_dump` custom em tmpfs, cria uma database nova com prefixo `ag04_restore_`, restaura em transação com `--exit-on-error`, compara linhas e recibo e verifica a sequência de identidade. Remove somente a database temporária que criou. O JSON final informa tempo observado. Não estabelece RPO/RTO, não testa schema/Auth/Storage Supabase e não substitui recuperação real no destino. Referências: [pg_dump](https://www.postgresql.org/docs/17/app-pgdump.html) e [pg_restore](https://www.postgresql.org/docs/17/app-pgrestore.html).

Não usar `down --volumes` no host compartilhado sem confirmar que o projeto é o ambiente descartável deste pacote. No runner CI exclusivo, a proposta inclui esse cleanup porque o job criou os volumes. Para repetir o teste local, os dados persistem; reinicialização exige revisão dos volumes próprios.

## Web/worker com secrets de staging

Criar um JSON **fora do checkout**, com permissões restritas, usando os campos de `runtime.example.json`, e definir `AG04_RUNTIME_SECRET_FILE` com o caminho. Substituir placeholders exclusivamente por credenciais de um projeto de staging autorizado. Compose secrets local é montagem de arquivo, não um cofre criptografado. Não colocar credenciais em YAML, argumentos, logs, evidências ou arquivo versionado.

Antes de build, definir `AG04_PUBLIC_SUPABASE_URL` e `AG04_PUBLIC_SUPABASE_ANON_KEY` com valores públicos do mesmo projeto de staging do runtime. Compose os encaminha aos argumentos públicos de build integrados pelo coordenador no Dockerfile. Configurar apenas runtime não assegura o cliente navegador. Service role continua exclusivamente em secret de execução; não fornecê-la como argumento de build. O pacote não declara container/browser autenticado homologado.

```powershell
$env:AG04_RUNTIME_SECRET_FILE = 'CAMINHO-ABSOLUTO-FORA-DO-CHECKOUT.json'
docker compose -f compose.antigravity.yaml --profile app up -d --build --wait
```

Bootstrap recusa placeholders, campos não permitidos e JSON inválido; ignora flags de publicação herdadas. Força sessão Supabase, scanner privado, publicação/feeds/offer patch/eBay desligados e recovery ligado. Esse ambiente serve para leitura/reconciliação e teste de configuração, não preparação automática ou upload. Não habilitar publicação para tornar um teste verde. Porta de liveness `/api/health` não confirma permissões, conexão com DB, fila nem validade das APIs.

Healthcheck do worker exige recibo do wrapper atualizado em 45 segundos e processo filho vivo. Mede liveness de processo; travamento de uma consulta/API é identificado pelos sinais de fila/lease, não por esse recibo. Não é heartbeat de progresso do job nem substitui o lease implementado no core.

## CI, release e drift

`ci-proposal.yaml` é proposta executável por acionamento manual em runner Linux descartável; precisa ser integrada pelo coordenador em workflow ativo. Executa gates locais, build, scanner real e restore sintético; nunca injeta secrets produtivos. Antes de ativar, fixar actions por SHA revisado e as imagens por digest; tags de desenvolvimento não são selo de release.

```powershell
node scripts/antigravity/infra/release-gate.mjs
node scripts/antigravity/infra/release-gate.mjs --staging
```

Staging exige digest sha256 de `AG04_CLAMAV_IMAGE` e `AG04_POSTGRES_IMAGE` e `AG04_ATTESTATION_FILE` com `checked_at` de no máximo 24 horas, `private_scanner_live_passed`, `synthetic_restore_passed`, `destination_reviewed`, `migration_drift_checked`, `supervisor_restart_passed` verdadeiros. Arquivo deve conter prova real produzida/revisada pelo operador; o gate não autentica declarações arbitrárias nem autoriza deploy. Inventário remoto e hashes de funções devem ser comparados com o manifest pelo coordenador; `migrations:verify` verifica somente a atestação registrada. Não aplicar/repetir migrations pelo ensaio.

`remote-drift.mjs` agora executa essa comparação read-only. Sem credenciais, `node scripts/antigravity/infra/remote-drift.mjs --query-only` emite SQL fixo (BEGIN READ ONLY/timeout10s/ROLLBACK) para um connector confiável. `AG04_DRIFT_SNAPSHOT_FILE` aceita JSON desse connector com idade≤1h; arquivo é evidência apenas quando sua proveniência foi verificada pelo operador. Alternativamente `AG04_DRIFT_CONNECTION_FILE` é JSON absoluto fora do checkout com project_id/host/user/database/password; host deve ser `db.<manifest-project-id>.supabase.co`, user/database postgres. Psql precisa estar instalado e ter CA apropriada para `sslmode=verify-full`; senha vai somente no ambiente do subprocesso e erros do provedor não são impressos. Não herda PGHOSTADDR/PGSERVICE/PGOPTIONS do usuário. Conexão directa IPv6 pode exigir ambiente compatível; não adquire add-on pago. [Conexões Supabase](https://supabase.com/docs/guides/database/connecting-to-postgres).

Drift verifica SQL/types locais, histórico remoto, MD5 dos corpos das funções definidos nas migrations atuais, quantidade de argumentos, SECURITY DEFINER, execute anon/authenticated e RLS habilitada nas tabelas rastreadas. Não afirma equivalência de toda expressão policy/coluna/índice/Storage/ownership. Uma consulta real do connector Supabase em06/10/2026 12:39:40Z verificou23migrations/12funções/10tabelas; registro é do instante e deve ser refeito após qualquer migration nova. O modo staging chama esse check; atestação booleana sozinha não substitui o resultado. `drift-check.mjs` tem5cenários negativos locais com snapshot sintético; não é uma conexão remota.

## Recuperação da aplicação no destino (pendente)

1. Registrar incidente e interromper novas mutações pelo procedimento do operador; selecionar backup autorizado e destino isolado.
2. Iniciar todos os processos com `PRELISTING_RECOVERY_MODE=true`, flags de publicação desligadas e secrets corretos, antes de conectar ao banco restaurado.
3. Verificar migrations/RLS, owner/org, revogações, Storage (objetos/recibos), leases, approval hashes e ledgers. Restore Postgres não restaura automaticamente os objetos Storage nem as APIs externas.
4. Conciliar envios e ofertas incertos por GET/readback e IDs conhecidos. Não repetir publicação por ausência de resposta no backup; manter unknown se não houver prova.
5. Testar scanner, supervisor e métricas; verificar dados novos perdidos contra backups/eventos e medir tempo até recuperação. FBR aprova RPO/RTO/retention/destino e piloto.
6. Somente após revisão da reconciliação, operador libera recovery e os fluxos já autorizados. Sem novas versões/SKUs autorizados, publicação permanece desligada.

## Métricas e alertas

`alerts.json` define sinais, fontes, limiares propostos e limitações: liveness, worker/restarts, fila/leases, unknown sem replay, scanner/idade de assinaturas, restore e drift. Logs estruturados do core têm IDs de correlação e excluem tokens/payloads. Integração depende do destino de logs, retention e autenticação para agregar endpoints privados. Não há destinatário configurado nem notificação externa neste pacote.
