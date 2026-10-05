# Amazon SP-API — acessos necessários para o FBR PreListing

Atualizado em 05/10/2026. Sergio informou que a empresa já foi aprovada na Amazon. O passo seguinte é confirmar o perfil de desenvolvedor, a aplicação e sua autorização para a conta correta; não refazer um cadastro já aprovado.

## O que obter primeiro

Uma **aplicação privada SP-API para Sellers**, de uso interno da FBRSigns, atende o escopo atual. As APIs abaixo são serviços da Amazon acessados pela aplicação: não é necessário criar uma aplicação diferente para cada API. Se já existe uma aplicação privada adequada, usar essa aplicação e confirmar seus papéis.

| Dado | Variável existente no app | Onde obter / conferir |
| --- | --- | --- |
| LWA client ID | `AMAZON_SP_API_CLIENT_ID` | Develop Apps → aplicação → Edit app → LWA credentials → View. |
| LWA client secret | `AMAZON_SP_API_CLIENT_SECRET` | Mesma aplicação e mesma tela do client ID. |
| Refresh token da conta vendedora | `AMAZON_SP_API_REFRESH_TOKEN` | Aplicação → Authorize app para a conta da FBRSigns. Gerar o token depois de selecionar os papéis necessários. |
| Seller ID / Merchant Token | `AMAZON_SP_API_SELLER_ID` | Seller Central → Settings → Account Info → Merchant Token; procurar Merchant Token se a organização do menu variar. Não usar o App ID ou o ID da marca. |
| Marketplace de destino | `AMAZON_MARKETPLACE_ID` | Amazon US: `ATVPDKIKX0DER`. Confirmar que a conta tem acesso a esse marketplace. |
| Região da API | `AMAZON_SP_API_ENDPOINT` | Amazon US: `https://sellingpartnerapi-na.amazon.com`. |

Guardar os três segredos de autenticação no `.env` local ignorado pelo Git ou no gerenciador de segredos do ambiente de execução. Não colar segredos nesta conversa, em stories, screenshots, commits ou variáveis `NEXT_PUBLIC_*`. O app troca o refresh token por access tokens automaticamente; o access token temporário não é uma configuração manual permanente.

## Caminho no portal

1. Entrar com o usuário principal no [Solution Provider Portal](https://solutionproviderportal.amazon.com/), ou acessar Seller Central → **Apps and Services → Develop Apps**.
2. Em **Develop Apps → Add new app client**, criar a aplicação privada SP-API da FBRSigns caso ainda não exista. Selecionar o tipo **Sellers** quando solicitado. Usar o perfil de desenvolvedor já aprovado. [Procedimento oficial de registro](https://developer-docs.amazon.com/sp-api/docs/registering-your-application).
3. Selecionar o papel **Product Listing** entre os papéis aprovados. Se ele não estiver disponível, solicitar no perfil de desenvolvedor; depois acrescentá-lo à aplicação e obter nova autorização. Adicionar **Selling Partner Insights** somente se adotarmos a consulta de participação da conta. Os papéis adicionais descritos abaixo são condicionais. [Papéis e reautorização](https://developer-docs.amazon.com/sp-api/docs/roles-in-the-selling-partner-api).
4. Em **Edit app → LWA credentials → View**, obter o client ID e client secret dessa aplicação. [Credenciais oficiais](https://developer-docs.amazon.com/sp-api/docs/viewing-your-application-information-and-credentials).
5. Escolher **Authorize app** para a conta vendedora da FBRSigns e guardar o refresh token gerado. A aplicação privada pode ser autorizada em draft; não precisa ser publicada na Appstore. A self-authorization da conta Seller Central exige o usuário principal. [Autorização privada](https://developer-docs.amazon.com/sp-api/docs/self-authorization).
6. Preencher as variáveis do servidor e executar `npm run catalog:check`. A validação inicial deve obter token e consultar product types/schema sem publicar produtos. O acesso às operações deve ser comprovado, não deduzido apenas da presença de credenciais.

## APIs e permissões

| API | Uso no sistema | Operações principais | Acesso / prioridade |
| --- | --- | --- | --- |
| Product Type Definitions `2020-09-01` | Classificar product types e obter atributos oficiais, enums e condicionais por marketplace e parentage. | `searchDefinitionsProductTypes`, `getDefinitionsProductType` | **Product Listing; obrigatório agora.** |
| Catalog Items `2022-04-01` | Procurar ASIN existente e consultar atributos/classificação, evitando criar item duplicado. | `searchCatalogItems`, `getCatalogItem` | **Product Listing; obrigatório para fechar discovery.** |
| Listings Restrictions `2021-08-01` | Identificar restrições e encaminhar aprovações por ASIN existente. | `getListingsRestrictions` | **Product Listing; obrigatório no fluxo aplicável.** |
| Listings Items `2021-08-01` | Preview, criar/atualizar SKU e consultar erros, aceite, discoverability e buyability. | `putListingsItem` com `VALIDATION_PREVIEW`, `putListingsItem`, `patchListingsItem`, `getListingsItem`, `searchListingsItems` | **Product Listing; obrigatório.** Verificar o papel exigido na referência de cada operação. |
| Feeds `2021-06-30` | Enviar vários listings e reconciliar o relatório de processamento por mensagem/SKU. | `createFeedDocument`, upload do documento, `createFeed` com `JSON_LISTINGS_FEED`, `getFeed`, `getFeedDocument` | **Product Listing para o feed de listings; Sprint S9.** Outros feed types podem exigir outros papéis. |
| Notifications `v1` | Receber alterações de issues, status e requisitos de product types sem depender só de polling. | Destinations/subscriptions; eventos `LISTINGS_ITEM_ISSUES_CHANGE`, `LISTINGS_ITEM_STATUS_CHANGE`, `PRODUCT_TYPE_DEFINITIONS_CHANGE` | **Sprint S9.** Conferir suporte de destino, versão de payload e acesso por tipo de notificação. |
| Sellers `v1` | Conferir marketplaces habilitados para a conta. | `getMarketplaceParticipations` | **Selling Partner Insights; recomendado, não necessário para obter o token LWA.** |
| Reports `2021-06-30` | Inventário de listings existentes e reconciliação do catálogo Amazon. | `createReport`, `getReport`, `getReportDocument` | **Sprint S6/S9.** Product Listing ou Inventory and Order Tracking conforme o report type; escolher o relatório antes de pedir papéis. |
| Product Fees `v0` | Estimativa de taxas para margem e preparação de marketing. | `getMyFeesEstimateForSKU`, `getMyFeesEstimateForASIN` | **Product Listing; Sprint S12.** Estimativa não equivale a taxa real final. |

A base de catalog/listings segue o [guia oficial de gerenciamento](https://developer-docs.amazon.com/sp-api/docs/manage-product-listings-guide). A elegibilidade por ASIN e a exigência do papel Product Listing são descritas em [Listings Restrictions](https://developer-docs.amazon/sp-api/lang-en_en/docs/get-listings-restrictions). Os tipos de eventos e seus payloads constam em [Notification Type Values](https://developer-docs.amazon.com/sp-api/docs/notification-type-values).

**Papéis condicionais:** Pricing somente se houver consulta de preços competitivos/repricing; Amazon Fulfillment para o escopo FBA correspondente; Inventory and Order Tracking para os relatórios e operações que o exijam. Brand Analytics, acesso a dados pessoais de compradores, Orders e papéis restritos não são necessários para preparar listings. Amazon Ads usa uma integração separada e só entra quando sua execução for definida e autorizada.

Não é necessário obter AWS access key, secret key ou IAM role para autenticar as chamadas SP-API atuais: a Amazon retirou essa exigência e usa LWA. Para a infraestrutura de notificações, **SQS/EventBridge pode exigir recursos e permissões AWS específicos**, separados da autenticação SP-API; o destino deverá ser escolhido conforme o evento. [Mudança oficial de autenticação](https://developer-docs.amazon/sp-api/lang-fr_FR/changelog/sp-api-will-no-longer-require-aws-iam-or-aws-signature-version-4).

O upload em lote deverá usar **JSON_LISTINGS_FEED**, não os feeds legados XML/flat file de listings descontinuados pela Amazon. O CSV atual continua sendo um handoff interno. [Feed types oficiais](https://developer-docs.amazon/sp-api/lang-US/docs/listings-feed-type-values).

## Diagnóstico atual: `invalid_grant`

O teste ao vivo de 05/10/2026 retornou HTTP 400 no endpoint LWA e o código **`invalid_grant`**, sem access token. Nenhum segredo foi registrado. Isso indica que o grant apresentado não foi aceito; não comprova recusa dos papéis SP-API nem reprovação da empresa, pois a chamada falhou antes de consultar essas APIs.

Próxima ação: gerar um refresh token por **Authorize app** para a conta correta, usando o client ID/client secret **da mesma aplicação**; conferir cópia integral, autorização/revogação e configuração sem espaços ou aspas indevidas. Um access token, authorization code ou App ID não substitui o refresh token. Confirmar a causa com o retorno sanitizado da Amazon; se persistir, usar Developer Support com código/horário/request ID, sem compartilhar segredos.

## Dados de produto e aprovações comerciais

O acesso SP-API não substitui GTIN válido ou isenção aplicável, marca autorizada, eventuais gates de categoria, habilitação Amazon Custom, direitos de mídia ou certificados exigidos para itens específicos. Preparar os documentos por SKU. Para produtos personalizados, confirmar o fluxo efetivamente suportado pela API e pelas ferramentas Amazon Custom, separando os recursos que ainda exigem configuração manual; FBM é requisito para o fluxo Custom.

O primeiro piloto deverá abranger produtos físicos, elétricos/LED/neon, personalizados, pai/filho e serviços corretamente excluídos. `ACCEPTED` não significa `BUYABLE`; parents não são compráveis. Não enviar o catálogo inteiro antes de demonstrar o ciclo com esses casos.

## Checklist do responsável pela conta

- [ ] Aplicação privada identificada ou criada; perfil de desenvolvedor confirmado.
- [ ] Product Listing aprovado no perfil e selecionado na aplicação.
- [ ] Client ID, client secret e refresh token pertencem à mesma aplicação/conta.
- [ ] Seller ID/marketplace/endpoint conferidos; token LWA obtido.
- [ ] Product types, schema e leitura de catálogo/listing exercitados sem mutação.
- [ ] Papéis opcionais solicitados apenas para operações escolhidas.
- [ ] Marca, GTIN/isenção, Amazon Custom e documentação dos SKUs piloto conferidos.
- [ ] Autorização específica de publicação piloto registrada antes de qualquer envio real.
