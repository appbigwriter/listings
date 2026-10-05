# Catálogo e preparação por marketplace — 05/10/2026

**Atualização posterior autorizada:** migrations do catálogo aplicadas e verificadas em 05/10/2026, incluindo grants explícitos. Consulte `MIGRATION-004-verification.md`. O banco está acessível, mas faltam usuários/ownership do legado e homologação Amazon; o diagnóstico LWA atual é `invalid_grant`. O plano completo agora está em `SPRINTS-004-operacao-completa.md`, e os acessos em `AMAZON-API-SETUP.md`. As referências abaixo a migrations pendentes descrevem o estado da primeira entrega.

## Implementação entregue

O monólito Next.js foi mantido. A central em `/catalog` e a página inicial recebem arquivos CSV/JSON ou consultam a fonte configurada da loja. A prévia permite conferir todos os itens antes de criar o lote. A leitura da fonte da FBR encontrou **203 registros, incluindo variantes**, sem alterar a loja. A amostra de 20 itens públicos em `tests/fixtures/catalog-source-sample.json` verifica normalização e bloqueios; não equivale a 20 listings aceitos pela Amazon.

Cada SKU conserva um documento versionado em `prelistings.payload._catalog`: identidade do produto, família de variantes, fatos com fonte e confirmação, classificação por canal, snapshots dos requisitos, mídia, relatórios, aprovação e resultado da submissão. O modelo em JSON mantém compatibilidade com o app anterior. Ainda não é um PIM com tabelas relacionais separadas para cada entidade.

Rascunhos exigem somente SKU e título. A IA sugere entre categorias retornadas pelo canal e gera conteúdo editorial com saída estruturada, seguido de uma segunda verificação de evidências. Dados técnicos não são preenchidos por suposição. Fontes conflitantes exigem reconciliação. A revisão humana continua necessária, especialmente para claims, certificações, produtos personalizados, fidelidade visual e direitos das imagens.

A aprovação inclui responsável, data, hash do conteúdo e assinatura do servidor. Edições invalidam a revisão. Exportação e publicação reavaliam a versão salva, a validade dos requisitos e da mídia. O handoff anterior também usa esse gate. A assinatura usa `PRELISTING_REVIEW_SECRET`, ou a chave service role do servidor como fallback; a rotação exige nova aprovação.

Os lotes de importação, classificação, geração, validação, mídia e consulta de situação possuem checkpoints, reserva temporária por worker, tentativas limitadas e resultados por item. A seleção pode incluir todas as páginas. O worker funciona como processo Node persistente; não depende de uma requisição HTTP longa. Geração com IA consome chamadas pagas por item, incluindo a segunda verificação.

## Canais e limites

| Canal | Preparação implementada | Limite atual |
| --- | --- | --- |
| Amazon US | Busca de product types, recomendação assistida, Product Type Definitions por parentage, JSON Schema com vocabulário Amazon, atributos, famílias pai/filho, restrições por ASIN, validation preview, pacote JSON, envio individual e readback | LWA retornou HTTP 400 com a configuração atual. Nenhuma categoria, schema ou submissão real foi validada nesta conta. Publicação desligada. |
| eBay US | Categorias oficiais, aspectos obrigatórios, enums e cardinalidade, pacote JSON por canal | Precisa de token e validação na conta. O schema cobre aspectos, não todas as políticas/ofertas/condições de publicação; não há envio por API. |
| Walmart US | Taxonomia, Get Spec com versão explícita, validação do schema reconhecido e pacote JSON | Precisa de token e versão Get Spec da conta. Não testado ao vivo; não há envio por API. |
| TikTok Shop US | Identificação do canal na interface e bloqueio explícito | Conector ainda não implementado. Não pode ser aprovado nem exportado como pronto. |

O CSV legado é um handoff interno normalizado, **não um template oficial de upload Amazon**. Para a integração implementada, use o payload JSON da Listings Items API. Upload por `JSON_LISTINGS_FEED`, gestão de preços/estoque contínua, notificações, pedidos e publicação para outros canais não foram implementados.

AJV verifica requisitos estruturais e condicionais suportados. Referências não resolvidas bloqueiam o produto. Regras de conta, marca, categoria restrita, moderação visual, aprovação de Amazon Custom e políticas textuais não se esgotam em JSON Schema; devem ser revisadas e confirmadas na plataforma. Para Custom o app bloqueia FBA. Um parent não é uma oferta comprável; não trate a ausência de BUYABLE nesse SKU como rejeição automática.

O envio Amazon reserva um registro persistente antes da chamada externa. A mesma versão não é reenviada automaticamente. Erros de rede ou falhas após o envio deixam resultado incerto e exigem consulta/reconciliação, evitando duplicação. ACCEPTED não significa que o produto esteja comprável: o readback separa aceite e situação da oferta. A publicação requer variável de ativação, versão aprovada e confirmação específica no editor; não existe publicação automática em lote.

## Ativação do banco

O teste remoto, apenas de leitura, identificou `prelistings.owner_id` ausente e as novas tabelas de jobs indisponíveis. Aplicar, após aprovação específica, na ordem:

1. `supabase/migrations/20261005165617_catalog_foundation.sql`: acrescenta os campos de escopo/lifecycle; preserva linhas antigas sem atribuir identidades; exige escopo em novos registros; substitui políticas do catálogo por leitura do proprietário autenticado; mutações passam pelo servidor.
2. `supabase/migrations/20261005165628_catalog_pipeline.sql`: cria `catalog_jobs` e `catalog_submissions`, índices, unicidade e RLS. Usuários autenticados consultam seu escopo; apenas o servidor escreve.

Na execução posterior autorizada, foi aplicado também `20261005165800_catalog_explicit_grants.sql`, para remover grants padrão amplos do projeto. Os nomes locais foram alinhados às versões efetivamente registradas no banco.

Os registros antigos sem proprietário permanecem armazenados, mas invisíveis ao app até um administrador fornecer um mapeamento verificado de usuário e organização. Nenhum backfill foi inventado. A primeira migration altera as permissões existentes do catálogo: integrações que escrevem diretamente pelo navegador devem migrar para as rotas autenticadas. Constraints globais antigas de SKU são preservadas; em bases com unicidade global, dois tenants ainda não podem reutilizar o mesmo SKU. A migration antiga de fechamento de marketing não é aplicada por este fluxo.

Criar/usar um usuário existente no Supabase Auth. A sessão do app usa cookies HttpOnly e verificação do usuário no servidor. `app_metadata.organization_id` deve ser definido por administrador; se ausente, o usuário usa seu próprio UUID como organização pessoal. Não usar `user_metadata` para autorizar acesso. `local-only` exige liberação explícita em desenvolvimento e IDs UUID válidos para consultar o banco.

## Configuração e operação

Copie os nomes de `.env.template`, mantendo chaves fora do Git e do navegador. A fonte da loja usa exclusivamente URL e chave pública anon/publishable, separadas do banco do PreListing. Alternativamente, uma API JSON HTTPS pode ser configurada com host permitido e token do servidor. A leitura atual integra tabelas `products` e `product_variants`; não é um crawler HTML genérico.

```powershell
npm ci
npm run catalog:check
npm run catalog:source-check
npm run dev
# Após aplicar as migrations e conferir o escopo do usuário:
npm run catalog:worker
# Processar somente uma rodada:
npm run catalog:worker -- --once
```

Fluxo: ler catálogo → conferir prévia → importar → selecionar SKUs e criar lotes → confirmar elegibilidade → selecionar classificação → buscar requisitos → preencher atributos e fatos reais → verificar mídia → revisar políticas → validar → aprovar versão → exportar. O validation preview Amazon deve ser usado seletivamente e respeita os limites da conta. Corrigir erros pelo relatório e consultar a oferta após um envio autorizado.

## Validação

- TypeScript e build de produção verificados.
- 60 testes Vitest de domínio, regressão e segurança, incluindo 20 itens públicos da FBR, requisitos condicionais, números não sustentados pela IA, conflito de atributos, coerência do SKU pai, variações e revisão assinada.
- As duas migrations são executadas em PostgreSQL local via PGlite: preservação do legado, escopo, permissões, unicidade, lease e idempotência.
- Fonte da loja lida ao vivo, sem escrita; banco inspecionado apenas por leitura; tentativa LWA sem publicar.
- Dependências Next/Supabase fixadas e transitivas vulneráveis atualizadas; auditoria npm sem vulnerabilidades na verificação desta entrega.

Não houve deploy, migração remota, publicação de produtos ou alteração dos dados da loja. A ativação completa depende de aplicar as migrations, verificar usuários, corrigir as credenciais LWA e executar o piloto de listings com requisitos reais da conta.

## Referências oficiais usadas

- [Amazon: workflows de listings e variantes](https://developer-docs.amazon.com/sp-api/docs/building-listings-management-workflows-guide).
- [Amazon: Product Type Definitions](https://developer-docs.amazon.com/sp-api/docs/product-type-definitions-api).
- [eBay: aspectos de categoria](https://developer.ebay.com/api-docs/commerce/taxonomy/resources/category_tree/methods/getItemAspectsForCategory).
- [Walmart: Get Spec](https://developer.walmart.com/us-marketplace/reference/getspec).
- [OpenAI: Structured Outputs](https://platform.openai.com/docs/guides/structured-outputs).
