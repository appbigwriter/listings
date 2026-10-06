# Fila de trabalho do Antigravity

Data: 05/10/2026. Esta fila organiza entregas delegáveis; não altera as dependências nem o aceite das 54 stories de S4–S12. Nenhuma tarefa foi atribuída automaticamente. Regressões AG-01 recebidas no checkout foram integradas parcialmente pelo coordenador; jornadas reais continuam pendentes.

| ID | Pacote | Prioridade | Liberação | Dependência |
|---|---|---|---|---|
| AG-01 | Harness E2E e regressões | P0 | Regressões de contrato integradas; E2E pendente | reports/AG-01-integration.md |
| AG-02 | UX/acessibilidade de componentes | P1 | Após AG-01 | Harness de regressão |
| AG-03 | Corpus e avaliação offline da IA | P1 | Pronto | Dados sanitizados; anotações qualificadas |
| AG-04 | Infraestrutura isolada | P0 | Pronto para diagnóstico/configuração | Docker/destino para execução real |
| AG-05 | Resiliência e carga | P1 | Após AG-01 | AG-04 quando o ensaio exigir containers |
| AG-06 | Runbooks e proposta de piloto | P1 | Pronto | Validação FBR para treino/aceite reais |
| AG-07 | Módulos eBay de famílias/condicionais | P2 | Condicional | Contrato/categorias eBay + nova baseline |
| AG-08 | Módulos Walmart de payload/feed | P2 | Condicional | Get Spec vigente + nova baseline |

## Ordem de despacho

Com um agente: AG-01 → AG-02 → AG-04 → AG-05 → AG-03 → AG-06. Se Docker impedir AG-04, registrar o diagnóstico e avançar AG-03/06; não remover gates nem alterar outros projetos para desbloquear o ensaio.

Com vários agentes: AG-01, AG-03, AG-04 e AG-06 podem avançar simultaneamente em cópias isoladas e caminhos distintos. AG-02 e AG-05 iniciam após integração do harness AG-01. AG-07/08 recebem novas baselines quando os contratos estiverem definidos. Nunca atribuir o mesmo pacote ou arquivo a dois executores.

A prioridade é fechar a jornada Amazon atual antes de expandir publicação para outros canais. eBay/Walmart não substituem o piloto e os gates S5/S8/S9. TikTok, contas reais, ownership do legado, dados físicos, publicação do piloto, contratação/deploy e aceite final continuam fora das tarefas liberadas agora.

## Propriedade e integração

O coordenador mantém o núcleo Amazon, APIs produtivas, autenticação/autorização, RLS/migrations, reservas/ledgers, worker, modelos/hashes/schema compartilhados e os documentos centrais de status. Agentes alteram somente os caminhos do pacote recebido. Propostas sobre caminhos protegidos vão para o relatório; o coordenador integra sob as autorizações já existentes.

Estados de entrega: preparado → em execução isolada → entregue para revisão → integrado. Bloqueio deve registrar requisito concreto e permitir avançar outro pacote liberado. Nenhum desses estados significa story homologada ou concluída; usar o contrato de aceite original.

## Gate de integração por pacote

1. Baseline identificada, diff restrito ao escopo e relatório completo.
2. Contratos/fixtures qualificados; dados físicos e comerciais não inventados.
3. Testes adequados, typecheck e build passam; não enfraquecer os 177 testes da baseline.
4. Dependências e mudanças em arquivos protegidos são incorporadas pelo coordenador, uma vez, sem lockfiles concorrentes.
5. Após integrar, executar regressões pertinentes e atualizar baseline para a próxima tarefa dependente.
6. Atualizar evidência central distinguindo código, teste local e homologação real. Sem publicação, gasto ou escrita produtiva automática por entregar um pacote.

Leia PROMPT.md e a ficha em tasks/ antes de iniciar. Use reports/ para entregas; não edite este quadro para fechar stories.


A frente principal e a sequência CX-01–06 estão em EXECUTION-CODEX-007.md. Codex mantém núcleo/integração; próximo incremento próprio: conexão Product Fees → economia no backend. Os escopos AG-02 de frontend ficam preservados. Antes de despachar tarefas novas, fornecer baseline atualizada; tarefas já iniciadas mantêm sua referência e entregam diff para integração.

Checkpoint 008: Fees/economia, provenance e autoridade persistente integrados pelo coordenador. Baseline 009 publicada após a verificação completa para tarefas ainda não iniciadas; tarefas em andamento preservam sua referência e entregam diff. Regressões locais de AG-01 não liberam gates que exigem navegador/sessão/worker reais.


Retomada 009 — 06/10/2026: reconciliação Amazon corrigida, correlação interna estruturada, recuperação administrativa de offerId eBay, ensaio local de kill/restart do worker, atualidade da prova de compra e modo explícito de recuperação implementados. 249 testes/54 arquivos, typecheck e build/41 rotas passaram. Sem nova migration ou publicação. Evidências e limites em EXECUTION-009-retomada.md. Baseline 010 é destinada somente a tarefas ainda não iniciadas; referências anteriores e escopos Antigravity permanecem preservados. Gates reais continuam pendentes.
