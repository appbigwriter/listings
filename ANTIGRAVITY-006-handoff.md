# Delegação organizada para Antigravity — 05/10/2026

Este arquivo é o ponto de entrada para tarefas delegáveis, preservando a execução S4–S12. O trabalho foi organizado; nenhum agente foi disparado nem tarefa concluída por esta organização.

## Entregue ao agente

1. coordination/antigravity/PROMPT.md — protocolo de execução e isolamento.
2. coordination/antigravity/BOARD.md — prioridades, dependências e sequência.
3. coordination/antigravity/tasks/AG-XX.md — pacote único atribuído, caminhos permitidos e aceite.
4. coordination/antigravity/BASELINE.json — referência de conteúdo do código atual.
5. coordination/antigravity/REPORT-TEMPLATE.md — modelo de entrega.

Com um agente, iniciar AG-01. Após integrar o harness, seguir AG-02, AG-04, AG-05, AG-03 e AG-06. Com vários agentes e cópias isoladas, AG-01/03/04/06 têm caminhos distintos e podem avançar em paralelo. AG-02/05 dependem do harness integrado. AG-07 eBay e AG-08 Walmart aguardam contratos oficiais definidos e nova baseline.

## Estado de referência

177 testes/34 arquivos, typecheck e build/39 rotas passaram. 19 migrations aplicadas e alinhadas com os arquivos locais. As 54 stories não estão fechadas: 2 concluídas, 35 parcialmente executadas e 17 bloqueadas no último levantamento. A fonte foi normalizada em 203 registros, incluindo 22 pais e 107 filhos; isso não comprova listings publicados.

## Trabalho reservado ao coordenador

Núcleo Amazon, APIs produtivas, autenticação/RLS, hashes/aprovações, reservas/ledgers, worker, schema compartilhado, migrations/tipos e integração do conjunto. Mudanças necessárias nesses caminhos vêm como proposta/teste, não como edição concorrente. Os documentos EXECUTION-005.md, OPERATIONS-005.md e SPRINTS-004-operacao-completa.md continuam como referência central.

## Dependências da FBR

E-mails/papéis/organização e colaboração; owner dos dois registros legados; grant Amazon corrigido; fatos/documentos/custos dos produtos; seleção/aceite e versões dos 20 casos piloto; destino de staging/deploy, backup e alertas; contas/contratos dos outros marketplaces. Guia Amazon: AMAZON-API-SETUP.md.

## Preservação do trabalho

O checkout atual contém alterações não commitadas/não versionadas. O agente deve receber uma cópia do estado atual sem secrets e trabalhar em outra pasta. Branch sozinha na mesma pasta não isola trabalho; main remoto sozinho não é a baseline atual. Não resetar, repetir migrations, enfraquecer gates ou publicar produtos. Integração e homologação seguem os critérios originais.
