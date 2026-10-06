# Handoff para Antigravity — 05/10/2026

## Estado verificado

Workspace: `F:/Projetos/_FBR/PreListing`. Fonte principal do estado: `EXECUTION-005.md`; critérios de aceite: `SPRINTS-004-operacao-completa.md`; operação: `OPERATIONS-005.md`.

Última validação: 177 testes em 34 arquivos, typecheck e build com 39 rotas aprovados. 19 migrations aplicadas/reconciliadas. A fonte tem 203 registros normalizados, incluindo 22 pais e 107 filhos. Isso não significa 203 listings aprovados/publicados. O banco de preparação tem dois registros legados sem owner e nenhum usuário real provisionado. Último diagnóstico Amazon: LWA `invalid_grant`.

## Pacote A — QA de interface e jornada operacional

Stories: S4-04/05, S8-05, S12-02/04.

Executar primeiro. Em branch ou worktree isolado, revisar os fluxos de login/refresh/logout, catálogo, editor por canal, evidências, custos, aprovação, arquivamento/restauração e retomada de lotes. Verificar mensagens, estados de carregamento, conflitos de versão, alterações não salvas e acessibilidade. Corrigir defeitos concretos; não redesenhar o sistema inteiro.

Criar testes E2E dos casos críticos: operador não aprova/publica; usuário de outro escopo não acessa dados; edição invalida aprovação; versão desatualizada não sobrescreve; reload conserva custos/planos/tracking; cancelamento não ressuscita lote; importação mantém pendências de fonte. Fixtures somente em ambiente local/isolado. Não criar usuários ou produtos fictícios no Supabase produtivo.

Entrega: alterações revisáveis, testes executados, screenshots e relatório de defeitos/limitações. Sem usuários reais, diferenciar E2E com fixtures de homologação operacional. Propor um ponto de injeção de dados de teste restrito ao ambiente de testes, sem habilitar atalhos de autenticação na aplicação produtiva.

## Pacote B — Infraestrutura e operação

Stories: S7-05, S11-01–06, parte de S9-05.

Diagnosticar o Docker local sem alterar outros projetos; validar imagem web/worker e dependências de runtime. Preparar staging com HTTPS, secrets, healthchecks e supervisor. Configurar ClamAV privado e atualização de assinaturas no destino aprovado; testar arquivos válidos/rejeitados, indisponibilidade e base vencida. Não expor clamd na internet.

Exercitar reinício/crash do worker, disputa de leases, cancelamento, limites e recuperação de checkpoint. Implementar correlação de logs/erros e preparar alertas; ativação de alertas externos depende do destino/recipientes autorizados. Executar CI no repositório e preparar detecção de drift. Documentar e ensaiar backup/restore em ambiente isolado, com RPO/RTO definidos pela operação.

Entrega: configuração reproduzível, evidências de execução e lista de dependências externas. Contratação de infraestrutura, mudanças em produção e restauração sobre dados reais não fazem parte de um teste local.

## Pacote C — Avaliação da IA e qualidade do catálogo

Stories: S7-01/02/03/06, S8-01/02, S12-01/04.

Preparar corpus e avaliador para classificação, conteúdo sustentado pelos fatos, limites de canal, famílias e requisitos condicionais. Trabalhar com amostra sanitizada e registrar quais casos ainda não têm dados verificados. IA não confirma medidas, GTIN, marca, material, certificações ou elegibilidade comercial.

Entrega: casos anotados, critérios/métricas e regressões reproduzíveis; custos estimados separados de consumo real. A equipe FBR deve fornecer/revisar os fatos dos 20 casos piloto e custos com fonte/data.

## Pacote D — Conectores, após contratos e acessos

Stories: S10-01–06.

eBay: completar famílias, condicionais avançados, revisão de listings existentes e recuperação de resultados incertos. Walmart: completar payload, feed, processamento e readback conforme Get Spec vigente da conta. TikTok: iniciar somente após definir shop, aplicação, região e versão suportada. Cada executor precisa de reserva durável, identificação da conta, manifesto da versão e reconciliação; mocks não equivalem a publicação homologada.

Entrega: alterações isoladas por conector, testes de falhas/timeouts/idempotência e matriz atualizada de capacidades. Não habilitar um canal como funcional antes da homologação do ciclo completo.

## Coordenação e limites

- Preservar todas as alterações existentes; não resetar checkout nem refazer migrations já aplicadas.
- Usar branch/worktree separado; combinar responsabilidade por arquivos compartilhados antes de integrar.
- Concentrar inicialmente o Antigravity no pacote A ou B. Manter núcleo Amazon, reservas de envio e migrations sob uma frente de integração para evitar alterações conflitantes.
- Segredos permanecem no ambiente/secret store; nunca em prompts, screenshots, logs ou commits.
- Não remover gates de aprovação, isolamento ou bloqueios de envio incerto para fazer testes passarem.
- Publicação real continua condicionada aos SKUs e versões do piloto autorizados; não criar campanhas/gastos.
- Registrar separadamente implementado, testado localmente e homologado; atualizar evidências sem marcar stories concluídas prematuramente.

## Pendências da FBR

E-mails e papéis dos usuários; organização e modelo de colaboração; owner real dos dois registros legados; grant Amazon corrigido; fatos/documentos/custos dos produtos; definição dos 20 casos piloto e autorização de versões; destino de deploy e decisões de backup/alertas; contas/permissões dos demais marketplaces. Caminho Amazon: `AMAZON-API-SETUP.md`.
