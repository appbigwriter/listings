# MP-001 — Módulo Marketing Readiness

## Status
implementado — verificado em 2026-09-07

## Depende de
MP-000 — Fundação do PreListing + Marketing Readiness (aprovado)

## Contexto completo
O projeto é o PreListing da FBRSigns, uma aplicação Next.js/TypeScript/Tailwind que prepara produtos para Amazon US e outros marketplaces. O módulo Marketing Readiness será agregado ao sistema atual e usará o `sku` como chave de conexão com `prelistings`.

A primeira fase atende somente FBRSigns. O destino inicial dos anúncios Meta será a página do produto na Amazon. Como o Pixel/CAPI não controla a página Amazon, a primeira medição será clique de saída e, quando elegível, Amazon Attribution.

A aplicação deve seguir o stack atual: Next.js 15, React 19, TypeScript, Tailwind 4, Route Handlers Node.js e Supabase/Postgres. A primeira versão produz planos revisáveis; não publica anúncios nem gasta verba.

## Objetivo
Criar uma área que transforme um PreListing salvo em um perfil de marketing completo, com margem real, plano Amazon PPC, plano Meta Ads, tracking e readiness gate para lançamento.

## Entradas
O módulo recebe um `prelisting` salvo, por exemplo:

```json
{
  "sku": "FBR-ROLLUP-001",
  "title": "Custom Roll Up Banner",
  "price": "249.00",
  "qty": "10",
  "fulfillment": "FBM",
  "images": "https://cdn.example/main.jpg\nhttps://cdn.example/detail.jpg",
  "keywords": "roll up banner, retractable banner, trade show display"
}
```

Também recebe custos reais aprovados:

```json
{
  "product_cost": 62.00,
  "printing_cost": 18.00,
  "packaging_cost": 7.00,
  "shipping_cost": 24.00,
  "amazon_referral_fee": 37.35,
  "fulfillment_fee": 0,
  "other_costs": 5.00,
  "currency": "USD",
  "calculated_at": "2026-09-02"
}
```

E a configuração Meta do produto:

```json
{
  "business_manager_id": "bm_fbrsigns_rollup",
  "ad_account_id": "act_123456789",
  "pixel_id": "pending",
  "destination_url": "https://www.amazon.com/dp/ASIN_PENDING"
}
```

## Elementos necessários

- Projeto existente em `F:\Projetos\FBRSigns-web\PreListing`.
- Node.js e npm instalados.
- Dependências atuais do `package.json`.
- Supabase configurado por `NEXT_PUBLIC_SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`.
- Migração SQL criada como parte deste Mini PRD.
- Não são necessárias credenciais Amazon Ads ou Meta Ads na primeira versão.
- Amazon Attribution é opcional e não deve bloquear a criação do plano quando ainda não estiver disponível.

## Funcionalidade detalhada

1. Criar a migração `supabase-marketing-schema.sql` com as tabelas `product_marketing_profiles`, `amazon_campaign_plans`, `meta_campaign_plans`, `tracking_plans` e `marketing_tasks` previstas no MP-000.
2. Criar a biblioteca `lib/marketing/validation.ts` com validação de SKU, preço, estoque, URL Amazon, margem e estado do produto.
3. Rejeitar margem quando faltar qualquer custo obrigatório. Não calcular margem usando zero silenciosamente.
4. Calcular margem real:
   - receita = preço de venda;
   - custos = produto + impressão + embalagem + frete + taxas Amazon + fulfillment + outros custos;
   - lucro unitário = receita - custos;
   - margem percentual = lucro unitário / receita * 100.
5. Criar `app/api/marketing-profiles/route.ts` com:
   - `GET ?sku=...` para carregar o perfil;
   - `POST` para criar ou atualizar o perfil;
   - `PATCH` para atualizar status e aprovação.
6. Criar `app/api/amazon-campaigns/route.ts` para gerar plano em rascunho, sem chamada de publicação.
7. O plano Amazon deverá conter campanhas Auto, Manual Exact, Manual Phrase, Manual Broad e Product Targeting, cada uma com objetivo, hipótese, orçamento, lance, keywords/ASINs e negativas.
8. Bloquear `launch_ready` se não houver preço, estoque, imagem principal, ASIN/oferta ou margem real.
9. Criar `app/api/meta-campaigns/route.ts` para gerar plano Meta direcionando à URL Amazon.
10. O plano Meta deverá registrar BM/ad account do produto, objetivo, públicos, criativos, orçamento, UTMs, evento `OutboundClick` e status Amazon Attribution (`pending`, `available`, `not_eligible`).
11. Não declarar `Purchase` como evento rastreado pela Meta enquanto a venda ocorrer na Amazon e não existir fonte de atribuição válida.
12. Criar `app/api/tracking-plans/route.ts` com URL de destino, parâmetros UTM, evento de clique, tag Amazon Attribution quando disponível e instruções de validação.
13. Criar `app/marketing/page.tsx` com tabela de SKUs, status de readiness, margem, BM Meta e bloqueios.
14. Criar `app/marketing/[sku]/page.tsx` com abas Produto, Economia, Amazon PPC, Meta Ads, Tracking e Launch Gate.
15. Criar `app/api/kanban/route.ts` para gerar cards em modo dry-run por padrão. A confirmação explícita deve ser necessária antes de criar cards reais.
16. Cards mínimos: `Amazon PPC plan`, `Meta Ads plan`, `Tracking plan`, `Creative brief` e `Launch gate review`.
17. Registrar cada origem e timestamp dos dados derivados. Dados de concorrente não podem ser copiados automaticamente para claims FBRSigns.
18. Estados permitidos do perfil: `draft`, `research_ready`, `campaign_plan_ready`, `tracking_ready`, `approval_pending`, `launch_ready`, `launched`, `optimizing`, `paused`.
19. Mostrar claramente a diferença entre plano criado, plano aprovado e campanha publicada.
20. Exportar JSON e Markdown. Não chamar APIs de anúncio na primeira versão.

## Saídas / Entregáveis

- Perfil de marketing persistido no Supabase.
- Cálculo de margem real auditável.
- Plano Amazon PPC em JSON/Markdown.
- Plano Meta Ads por BM/ad account do produto.
- Plano de tracking com outbound click e Amazon Attribution opcional.
- Readiness gate com bloqueios explícitos.
- Preview de cards para o Kanban.
- Exportação de pacote de marketing por SKU.

## Arquivos tocados

- Criar: `supabase-marketing-schema.sql`
- Criar: `lib/marketing/validation.ts`
- Criar: `lib/marketing/margin.ts`
- Criar: `lib/marketing/plans.ts`
- Criar: `app/api/marketing-profiles/route.ts`
- Criar: `app/api/amazon-campaigns/route.ts`
- Criar: `app/api/meta-campaigns/route.ts`
- Criar: `app/api/tracking-plans/route.ts`
- Criar: `app/api/kanban/route.ts`
- Criar: `app/marketing/page.tsx`
- Criar: `app/marketing/[sku]/page.tsx`
- Modificar: `app/dashboard/page.tsx` para incluir acesso ao módulo

## Tabelas de banco tocadas

- `prelistings`: somente leitura nesta primeira versão.
- `product_marketing_profiles`: dono deste Mini PRD.
- `amazon_campaign_plans`: criar e atualizar rascunhos.
- `meta_campaign_plans`: criar e atualizar rascunhos.
- `tracking_plans`: criar e atualizar planos.
- `marketing_tasks`: criar previews/refs de handoffs.

## Variáveis de ambiente necessárias

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Não adicionar tokens Amazon Ads ou Meta Ads neste Mini PRD.

## Contrato de Handoff

O próximo componente recebe:

```json
{
  "sku": "FBR-ROLLUP-001",
  "marketing_profile_id": "uuid",
  "status": "campaign_plan_ready",
  "margin": {
    "revenue": 249,
    "total_cost": 153.35,
    "profit": 95.65,
    "percentage": 38.41,
    "currency": "USD"
  },
  "amazon_url": "https://www.amazon.com/dp/ASIN_PENDING",
  "meta": {
    "business_manager_id": "bm_fbrsigns_rollup",
    "ad_account_id": "act_123456789"
  }
}
```

## Critérios de Aceite

- [ ] É possível abrir `/marketing` e visualizar os SKUs salvos.
- [ ] É possível criar um perfil Marketing Readiness para um SKU existente.
- [ ] O sistema calcula margem real somente com custos preenchidos e mostra a fórmula.
- [ ] O sistema bloqueia readiness quando faltar preço, estoque, imagem ou URL Amazon.
- [ ] O plano Amazon contém Auto, Exact, Phrase, Broad e Product Targeting.
- [ ] O plano Meta registra BM/ad account individual do produto.
- [ ] O plano Meta usa `OutboundClick` como evento inicial, não `Purchase` fictício.
- [ ] Amazon Attribution pode ficar `pending` sem bloquear o rascunho.
- [ ] Export JSON funciona e contém SKU, margem, planos e tracking.
- [ ] Nenhuma rota publica anúncio ou envia orçamento para plataforma externa.
- [ ] Dados de um SKU não aparecem no perfil de outro SKU.

## Como testar e validar

1. No projeto, executar `npm install`.
2. Aplicar `supabase-marketing-schema.sql` no projeto Supabase de teste.
3. Executar `npm run dev`.
4. Abrir `http://localhost:3000/marketing`.
5. Criar ou selecionar um SKU existente.
6. Preencher preço `249`, estoque `10` e todos os custos do exemplo.
7. Confirmar lucro `95.65` e margem aproximada de `38.41%`.
8. Gerar plano Amazon e confirmar as cinco estruturas de campanha.
9. Gerar plano Meta e confirmar destino Amazon, BM/ad account e `OutboundClick`.
10. Exportar JSON e confirmar que o arquivo contém os quatro blocos: produto, economia, canais e tracking.
11. Remover o custo `shipping_cost` e tentar calcular margem; resultado esperado: bloqueio explícito, sem assumir zero.
12. Remover a URL Amazon; resultado esperado: perfil não pode avançar para `launch_ready`.
13. Usar um SKU inexistente; resultado esperado: HTTP 404 na API de perfil.
14. Criar dois SKUs e confirmar que os planos e margens permanecem separados.

## Mocks necessários para testar isolado

- PreListing mock com SKU `FBR-ROLLUP-001` conforme exemplo de entrada.
- Supabase mock retornando um `prelisting` e uma linha de perfil.
- Amazon Attribution mock com status `pending`.
- Kanban mock retornando preview sem criar card real.
- Nenhuma chamada real para Amazon Ads, Meta Ads ou publicação.
