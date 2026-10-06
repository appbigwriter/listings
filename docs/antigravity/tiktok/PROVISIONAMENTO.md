# TikTok Shop US — preparação provisionada, conector desligado

O módulo `lib/marketplaces/tiktok/` prepara contratos e requests para integração posterior. Nenhuma rota/capability de produção foi habilitada. Não há aplicação, shop, versão de produto, autorização ou contrato oficial de conta presumido. Os testes usam schemas/identidades explicitamente sintéticos.

Fontes primárias consultadas em 06/10/2026:

- [SDK oficial](https://partner.tiktokshop.com/docv2/page/tts-api-sdk-overview): pacote/versões dependem dos apps e escopos aprovados na conta. Baixar o Node SDK gerado pela conta quando disponível; não instalar uma versão global presumida.
- [Versionamento](https://partner.tiktokshop.com/docv2/page/api-versioning): selecionar versão por endpoint e confirmar mudanças no changelog. Exemplos não definem a versão atual suportada.
- [Parâmetros comuns](https://partner.tiktokshop.com/docv2/page/678e3a4278f4c20311b8b57e): APIs modernas levam token no header; timestamp é em segundos; `shop_cipher` depende do endpoint.
- [Exemplo oficial de assinatura](https://partner.tiktokshop.com/docv2/page/wfi3nz36): HMAC-SHA256 com path, parâmetros ordenados e bytes exatos do corpo; multipart tem tratamento específico.
- [Erros comuns](https://partner.tiktokshop.com/docv2/page/678e3a45786253031531b942): HTTP e code de negócio precisam ser conferidos; code 0 não comprova publicação/identidade.

As páginas abertas diretamente retornaram shell JS; o conteúdo indexado das páginas primárias forneceu essas regras. A referência de assinatura foi corroborada no exemplo Go oficial. Não foi obtido contrato completo de token/product endpoint autenticado. TTS Open Toolkit apareceu no índice/changelog oficial; nenhum CLI foi instalado nem OAuth iniciado neste pacote. SDK/Open Toolkit só complementam os contratos aprovados da conta.

## Interface de integração

`TiktokContract` é um **envelope interno**, não formato oficial do TikTok. Deve ser fornecido pelo backend a partir de endpoint/versão/schema aprovado: identidade app/shop/cipher US, origem documental, data/expiração, método/path exatos, escopos, necessidade de cipher no query e schemas request/query/response. Checksum identifica integridade do snapshot; não certifica que alguém importou corretamente uma fonte oficial. Contratos nunca vêm do corpo de uma requisição de operador.

`assertContract` recusa ausência, checksum divergente, outra conta, source host estranho, versão/path incompatível, expiry inválida e schemas ausentes. A validade máxima de sete dias é política local de atualização, não promessa de validade oficial. AJV valida condicionais e `$ref` locais; requisito incompatível/externo não resolvido bloqueia, sem consulta de rede de schemas.

`prepareTiktok` exige SKU/versão/hash e payload já mapeado com fatos confirmados. Não seleciona categoria, traduz unidade, converte preço, preenche medida/identidade ou atribui shop. O manifesto contém snapshots e hash, `review_required=true` e `publication_enabled=false`. Reservas/approval/publicação exigirão integração ao núcleo existente quando os contratos reais estiverem disponíveis.

`createTiktokReader` fica desligado por padrão e, quando integrado/configurado explicitamente no servidor, admite apenas GET de contrato read. Todas as mutações continuam recusadas. Host é fixo `open-api.tiktokglobalshop.com`; path é validado, parâmetros de credencial são reservados, redirects proibidos, timeout 15s, resposta limitada a 2MB e sem retry. Exceptions expõem códigos locais sanitizados. Os dados precisam corresponder ao response schema importado; esta leitura não comprova propriedade/comprabilidade por si só.

`signTiktokRequest` calcula assinatura sobre os mesmos bytes transmitidos. Não reserializar JSON após assinar. Token fica no header; segredo nunca aparece em URL/UI/log. A assinatura de API não deve ser reutilizada para webhook; receiver de webhook não foi adivinhado/provisionado sem seu contrato.

## Token e secrets

`TiktokTokenRecord` também é **formato interno normalizado**, com expirations absolutas em milissegundos e identidade completa. O importador deve interpretar a semântica temporal da versão de resposta oficial obtida na conta; não foi assumido TTL fixo nem endpoint de refresh.

`createTiktokTokenManager` recebe secretstore e refresh adapter explícitos. Refresha somente quando faltam 60s de margem; lê novamente o registro dentro de lock do secretstore, usa CAS e valida conta, versão, expiração/revogação e scopes. Singleflight local limita chamadas simultâneas; `withRefreshLock` deve prover exclusividade distribuída no destino para proteger rotação entre processos. Sem adapter/lock a renovação falha fechada. A implementação de lock/storage real e o parser HTTP de token continuam dependentes da infraestrutura/contrato. Exceptions de store/provider não devolvem mensagens brutas.

Armazenar app secret, access/refresh tokens em secretstore privado do destino, nunca no JSON de contrato/pilot ou chat. Não ampliar scopes por configuração: autorização real precisa ser refeita para scopes não concedidos. Revogação deve invalidar o registro no secretstore e impedir a próxima consulta; transação externa já em voo não tem rollback garantido.

## Dados a obter no Partner Center

1. Criar/configurar aplicação elegível para a operação da FBR, redirect HTTPS e permissões de catálogo/produto necessárias, conforme o tipo de app aprovado.
2. Autorizar a loja US por fluxo oficial de seller/app e guardar secrets fora do chat. OAuth do Toolkit/Partner Center não substitui automaticamente seller access token.
3. Obter app key, shop ID, shop cipher, região e scopes concedidos com evidência de correspondência à loja. Confirmar IDs no Seller Center; não usar sample IDs da documentação.
4. Baixar SDK/OpenAPI com versões efetivas por endpoint, esquemas de produto/categoria/condicionais/identidade/estoque, token/get/refresh e resposta de shop authorization. Obter regras de personalização/fulfillment da conta.
5. Importar snapshots via backend trusted, testar em shop de desenvolvimento autorizado, integrar gates owner/org, aprovação por hash/versão, ledger, monitor e reconciliação. Só depois decidir piloto e habilitação real.

A rota continua indisponível até integração/homologação. Nenhum toggle neste pacote permite POST/publicação. `code=0`, schema passando e teste de signer não homologam TikTok Shop.

## Verificação local

```powershell
npx vitest run tests/antigravity/tiktok/provisioning.test.ts
npm run typecheck
```

Casos cobrem vetor de assinatura sintético, bytes, exclusões/multipart, SSRF/path/query, timestamps, contratos vencidos/trocados, preparo snapshot/condicionais, refresh singleflight/lock/CAS, scopes/revogação, exceções sanitizadas, GET com host/header restritos, schema/limite de resposta e bloqueio de mutações. Nenhum request real foi feito.
