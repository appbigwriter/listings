# Parser de notificações Product Type Definitions

06/10/2026. Implementação isolada em `lib/marketplaces/amazon-schema-notifications.ts`, snapshot `lib/marketplaces/schemas/amazon-definitions-notification-v1.json` e testes `tests/antigravity/amazon-schema/definitions-parser.test.ts`. Não alterou parser/configuração/worker existentes, SQL ou ACK.

Fonte: [schema oficial ProductTypeDefinitionsChangeNotification](https://raw.githubusercontent.com/amzn/selling-partner-api-models/main/schemas/notifications/ProductTypeDefinitionsChangeNotification.json), baixado integralmente do repositório Amazon em 06/10/2026. Snapshot permanece intacto. É contrato de notificação/payload 1.0, com AccountId e ProductTypeVersion obrigatórios; MarketplaceId e NewProductTypes são opcionais.

SHA256 do snapshot: `eb71e197fa966c8de17da426d3f6c74906d4366165b64de5d2bbc4f6bd7969fa`.

`parseDefinitionsNotification(body, config)` aceita o NotificationConfig atual com ApplicationId opcional. Retorna a notificação original tipada e campos limitados de roteamento em `sanitized`. Valida envelope EventBridge account/region/source/version, tipo e versões 1.0, schema oficial, IDs e datas, AccountId igual sellerId, SubscriptionId configurado e ApplicationId quando presente na configuração. Campo ApplicationId recebido continua obrigatório pelo schema e limitado a identificador sem controles/URLs.

A assinatura usa `config.subscriptions.PRODUCT_TYPE_DEFINITIONS_CHANGE`, com fallback para `AMAZON_EVENTS_DEFINITIONS_SUBSCRIPTION_ID`. O parser não busca assinaturas na Amazon e não inventa uma assinatura. Marketplace explícito deve coincidir com US configurado; omissão, documentada no schema, é aceita somente com config US e retorna `marketplace_scope=all_marketplaces`, mantendo a notificação original sem acrescentar um MarketplaceId. `sanitized.marketplace_id` é o destino interno configurado, não uma declaração de marketplace no payload.

Limites locais conservadores: 256.000 bytes UTF-8, IDs/version até 200 caracteres, ApplicationId até 256, NewProductTypes de 1–1.000 nomes únicos em formato uppercase/underscore. Omissão de NewProductTypes retorna lista interna vazia e não inventa novos tipos. Se um contrato futuro expandir nomes/IDs/versões, atualizar a validação explicitamente; mensagens rejeitadas não devem ser ACKadas silenciosamente.

Verificação: **12 testes passaram**, typecheck passou. Casos: exemplo oficial, omissões documentadas, roteamento de conta/marketplace/source/region, assinatura/app ID opcionais e fallback env, versões desconhecidas, malformed/oversize JSON, versão vazia/controle, product types inválidos/duplicados/excessivos e data impossível. Nenhuma chamada marketplace ou escrita produtiva.

Integração pelo coordenador: configurar assinatura real, persistir payload/hash/notification ID e fanout idempotente de jobs de atualização do schema; ler owner/org do catálogo e nunca do evento; manter aprovações invalidadas se o schema mudar; ACK somente após enfileiramento durável e não após parse isolado. ProductTypeVersion sinaliza uma nova versão; NewProductTypes não limita o conjunto de schemas potencialmente alterados. Evento sem marketplace não deve gerar jobs para marketplaces alheios ao canal configurado.
