# AG-03 — corpus offline v1

Todos os 47 casos são sintéticos. Materiais, dimensões, valores, marcas e identificadores são apenas entradas de teste, nunca medições ou fatos confirmados de produtos FBR. `example.invalid` não é imagem operacional. Nenhum produto da loja foi anotado como verificado por este pacote.

Execute:

```powershell
npx tsx scripts/antigravity/evals/run.ts evals/antigravity/corpus-v1.json artifacts/antigravity/AG-03/report-v1.json
npx vitest run tests/antigravity/evals/offline-corpus.test.ts
```

O runner bloqueia `fetch`, não importa um provider de IA e ignora chaves presentes no ambiente. Reutiliza os contratos reais de grounded copy, classificação, catálogo, readiness, família e copy por canal. O relatório registra hash do corpus e cada caso, denominadores, falsos aceites/rejeições e falhas. Uma falha não reduz o denominador e causa saída 1. Os limites de copy refletem o contrato local do aplicativo; requisitos específicos carregados de marketplaces permanecem necessários.

Há 18 outputs IA salvos (5 esperados positivos, 13 negativos) e 29 contratos (9 identidade/oferta, 5 condicionais/readiness, 5 famílias, 10 copy). Categoria `fixture-signs` é candidata fictícia e não categoria oficial. Confiança baixa pode ser válida no contrato e não significa categoria aprovada. Os casos positivos de família validam compatibilidade antes da publicação; não exercitam o readback Amazon exigido para publicar filhos.

Nenhuma taxa deste corpus mede qualidade do modelo ao vivo, conformidade integral de marketplace ou piloto. `human_qualified_catalog_cases=0` e `marketplace_homologated=false` são intencionais. A anotação de um claim proibido testa o gate daquela anotação; não prova detecção semântica universal de claims.

Para ampliar, copie o corpus para uma nova versão, mantenha IDs estáveis e anote origem por caso. Amostras sanitizadas da loja continuam candidatas até revisão humana com fonte real de cada fato, revisão registrada e requisitos oficiais atuais. Não reutilize os fixtures de AG-01 como fatos verificados: contêm claims de desempenho sintéticos.

A avaliação com provider real permanece separada e desligada. Exige modelo/versionamento, quota e orçamento aprovados, tabela de custos, escopo de dados, runtime de reserva de uso existente e anotações humanas qualificadas. Este pacote não contém botão/env que possa habilitar gasto por acidente.
