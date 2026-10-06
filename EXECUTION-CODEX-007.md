# Frente principal — Codex / integração S4–S12

Data: 05/10/2026. Este plano distribui responsabilidade e sequência; não declara execução ou conclusão de novos blocos. Critérios de aceite continuam em SPRINTS-004-operacao-completa.md, estado por story em EXECUTION-005.md. Referência técnica: 177 testes/34 arquivos, typecheck/build/39 rotas aprovados e 19 migrations aplicadas.

## Responsabilidade

Codex mantém implementação e integração do núcleo: APIs, autenticação/autorização, RLS/migrations/tipos, importação/provenance, modelos/hashes/aprovações, requisitos compartilhados, filas/leases, reservas/ledgers, Amazon e economia de marketing. Integra alterações de frontend, infra, testes e conectores entregues pelos pacotes do Antigravity.

Antigravity executa os pacotes AG-01–08 conforme o handoff, em cópias isoladas e caminhos permitidos. QA identifica/reproduz defeitos; a frente principal corrige os arquivos protegidos. Infra prepara overlays/propostas; arquivos compartilhados e alterações no destino são incorporados pela frente de integração dentro das autorizações existentes. Não editar o mesmo arquivo simultaneamente.

## Blocos de execução

| Bloco | Sprints/stories | Trabalho da frente principal | Dependências e limite de aceite |
|---|---|---|---|
| CX-01 — Contas e acesso | S4-02–05, S5-01–06 | Provisionar identidades reais, vincular legado conforme mapeamento, corrigir problemas de sessão/CRUD e validar grant/leituras/schema/discovery na conta correta. | FBR informa e-mails, papéis, organização/colaboração e owner do legado; grant/autorizações Amazon válidos. AG-01 fornece regressões. Não inventar identidade, GTIN/isenção ou aprovação comercial. |
| CX-02 — Catálogo e requisitos | S6-01–06, S7-01–06 | Fechar autoridade/provenance por campo, reconciliação da fonte, consistência das famílias Amazon, aplicação dos requisitos condicionais e integração da avaliação de conteúdo/mídia. | Partes de código podem avançar sem acesso. Schemas/famílias reais exigem S5; fatos/documentos exigem FBR. AG-03 entrega corpus e AG-04 valida infraestrutura de scanner. |
| CX-03 — Ciclo Amazon | S9-01–06 | Fechar recuperação de falhas, reconciliação/convergência, autoridade de preço/estoque, tratamento de normalizações e integração dos eventos. Corrigir falhas de crash/leases demonstradas pelos ensaios. | AG-05 entrega cenários locais; APIs/eventos reais exigem grant e recursos AWS configurados. Publicação exige piloto, SKUs e versões autorizados; incerteza não libera replay automático. |
| CX-04 — Economia e marketing | S12-01–03 | Integrar Product Fees à economia por SKU com fonte/data/preço/fulfillment; manter estimativa distinta de custos reais; fechar persistência, margem por canal, gates e handoffs versionados. | Preparar código/contratos agora. Leituras reais de fees dependem S5; custos e destino de handoff dependem FBR. AG-02/06 entregam melhorias de UI e material operacional. Não criar anúncios/gastos. |
| CX-05 — Conectores e infraestrutura integrada | S10-01–06, S11-01–06 | Integrar módulos eBay/Walmart, transportar propostas de reserva para o núcleo, revisar contratos/capabilities, incorporar CI/drift/logs/supervisão/backup e corrigir defeitos de integração. | AG-04/07/08 e contratos reais. TikTok depende de shop/aplicação/região/versão. Capacidade só é liberada após evidência adequada; conta aprovada não equivale a conector homologado. |
| CX-06 — Piloto, rollout e aceite | S8-01–06, S11-04/05/06, S12-04–06 | Conduzir regressão integrada, homologação com usuários reais, piloto de 20 casos, reconciliação dos resultados, liberação progressiva e consolidação das evidências. | Gates anteriores, dados/documentos, staging/restore e aceite FBR. AG-01/05/06 contribuem com testes/runbooks. Não fechar stories nem declarar 100% por testes locais. |

## Ordem operacional

1. Próximo incremento de código: **CX-04, conexão Product Fees → economia**, em arquivos de backend reservados; frontend é integrado depois para preservar o escopo AG-02.
2. Seguir **CX-02**, fechando os contratos de autoridade por campo e os pontos de catálogo/requisitos que independem de acesso real.
3. **CX-01** avança assim que identidades/mapeamento/grant forem fornecidos; não exige suspender os incrementos de código anteriores.
4. **CX-03** recebe as regressões AG-05 e é homologado após os desbloqueios S5/S8/AWS pertinentes.
5. Integrar os pacotes condicionais em **CX-05** conforme forem entregues, sem antecipar publicação de canais.
6. **CX-06** fecha os gates operacionais, rollout e aceite depois das evidências reais.

Blocos cruzam sprints porque o backlog tem dependências entre elas; as 54 stories e sua definição de aceite permanecem intactas. Parte entregue em um bloco não fecha automaticamente toda a sprint.

## Baselines e integração

O checkout atual contém trabalho não commitado/não versionado. Ao despachar uma tarefa ao Antigravity, fornecer snapshot isolado e identificado do estado atual, sem secrets, incluindo essas alterações pertinentes. A baseline anterior deve ser preservada como referência de quem já iniciou trabalho; novas tarefas recebem uma nova baseline após integrações. A branch/commit remoto sozinhos não representam o código atual.

Arquivos de package/lockfile, CI, configuração compartilhada e migrations têm um único integrador. Propostas de schema seguem CLI/migration, teste local, aplicação sob autorização existente, verificação remota e alinhamento de timestamps/tipos. Não reaplicar as 19 migrations existentes.

Cada entrega registra código implementado, testes locais, homologação real, limitações e requisitos ainda pendentes. A coordenação é técnica; não cria novas exigências de confirmação para trabalho já autorizado. Publicações e ações que dependem de identidade/destino/versão continuam vinculadas aos dados e autorizações específicos.
