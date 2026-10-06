# Instrução de execução para o agente Antigravity

Você recebe UM pacote da fila BOARD.md. Se o usuário não identificar um pacote, começar por AG-01. Organize o trabalho dentro desse pacote e entregue o resultado para integração; não assuma que todos os pacotes foram liberados ao mesmo executor.

## Contexto e partida

O projeto é FBRSigns PreListing, Next.js/React/Supabase. Estado atual: 177 testes em 34 arquivos, typecheck/build com 39 rotas aprovados e 19 migrations aplicadas. Conta Amazon aprovada conforme a FBR, mas último grant LWA retorna invalid_grant; zero usuários reais provisionados e dois registros legados sem owner. Fonte: 203 registros normalizados, com variantes. Não declarar operação 100% ou publicação homologada.

Ler, nesta ordem: ANTIGRAVITY-006-handoff.md; EXECUTION-005.md; OPERATIONS-005.md; SPRINTS-004-operacao-completa.md; coordination/antigravity/BOARD.md; sua ficha tasks/AG-XX.md. Respeitar também instruções locais aplicáveis.

## Isolamento da execução

O checkout principal é F:/Projetos/_FBR/PreListing e tem alterações locais/não versionadas importantes. Não editar nem trocar a branch dessa pasta. Outra branch na mesma pasta não isola agentes. Um worktree baseado somente no main remoto também não contém necessariamente a implementação atual.

O coordenador deve fornecer uma cópia/snapshot do estado atual, incluindo arquivos não commitados e não versionados pertinentes, sem .env, chaves, node_modules ou outputs de build. Trabalhar nessa cópia em diretório próprio e branch própria quando disponível. Branch sugerida: codex/antigravity-ag-XX. Não fazer reset/clean do checkout original nem copiar secrets dele. A referência de conteúdo é BASELINE.json, não apenas o commit Git.

Rodar node coordination/antigravity/check-baseline.mjs ao receber a cópia para conferir o estado inicial. Antes da entrega, rodar o mesmo comando com --task AG-XX para identificar mudanças fora de escopo. O checker é uma ferramenta de revisão de conteúdo, não um sandbox de segurança.

## Contratos protegidos

Não editar app/api/**, middleware.ts, lib/auth.ts, lib/http.ts, lib/net/**, lib/ai/**, lib/catalog/**, lib/marketing/**, lib/supabase/**, os arquivos Amazon/OAuth/adapters/capabilities/schemas oficiais, supabase/**, package.json, package-lock.json, Dockerfile/compose.yaml, CI principal ou configurações compartilhadas. Também ficam protegidas as páginas/componentes de aprovação/publicação e documentos centrais, salvo caminho expressamente permitido na ficha. Não alterar hash, assinatura, owner/org, fonte de autoridade, payload ou semântica de confirmação do usuário.

Se for necessária uma mudança nesses arquivos ou uma dependência nova, documentar o defeito, reproduzir o caso e apresentar a proposta no relatório. Não pedir uma confirmação genérica a cada detalhe de implementação do pacote; continuar dentro do escopo liberado e separar bloqueios reais de escolhas locais reversíveis.

## Dados e execução

Fixtures somente em ambientes descartáveis. Nenhum usuário/owner fictício no Supabase produtivo; nenhuma alteração na loja, secrets ou infraestrutura de outro projeto. Não aplicar/repetir as 19 migrations nem gerar tipos a partir de um banco diferente para substituir os atuais.

Não publicar listings, alterar ofertas, criar anúncios/gastos ou enviar mensagens/alertas para destinatários externos. O piloto exige SKUs/versões autorizados e dados reais. Preparar integração/configuração não equivale a ativá-la. Não contornar isolamento, scanner, gates de revisão ou bloqueio de envio incerto.

## Evidência e entrega

Guardar evidências em artifacts/antigravity/AG-XX/ e preencher coordination/antigravity/reports/AG-XX.md a partir de REPORT-TEMPLATE.md. Registrar baseline_id, paths alterados, cenário/resultado, comandos, limitações, dependências e proposta de integração. Não expor tokens/dados pessoais em evidências.

Quando houver mudanças de código, executar npm test, npm run typecheck e npm run build, além dos checks relevantes do pacote. Se um ambiente impedir uma verificação, declarar exatamente o que foi e não foi executado. Não substituir testes reais por checks que apenas espelhem a implementação.

Entregar diff/patch ou branch da cópia isolada para revisão. Não fazer merge/push/deploy automático nem atualizar o status global das stories. O coordenador incorpora o trabalho, executa a regressão integrada e emite a próxima baseline. Não modificar recursos já concluídos sem defeito demonstrado.

