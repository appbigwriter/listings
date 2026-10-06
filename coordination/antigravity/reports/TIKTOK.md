# TikTok Shop US — contratos e integração posterior

Implementados módulos exclusivos `lib/marketplaces/tiktok/{contracts,signing,tokens,transport,index}.ts`, testes `tests/antigravity/tiktok/provisioning.test.ts`, guia `docs/antigravity/tiktok/PROVISIONAMENTO.md` e evidência `artifacts/antigravity/TIKTOK/provisioning-validation.json`.

Provisionamento: envelope interno versionado/shop-bound/checksum/expiry/schemas; preparação explícita sem inferência factual; HMAC de requests sustentado no exemplo oficial; timestamp em segundos; reader GET desligado por padrão com host fixo, tokens no header, sem redirect/retry, timeout e limite de bytes; ciclo de tokens normalizados com secretstore/CAS/lock obrigatório para refresh e escopos/revogação. Exceptions sanitizadas. Todas as mutações recusadas independentemente da configuração; capabilities/core permanecem desligados.

Validação: 10/10 testes no Vitest, um arquivo; `npm run typecheck` passou. Nenhum request TikTok real, OAuth, CLI instalado, nova dependência, alteração de migração, API produtiva, secret ou publicação. Vetores/identidades/schemas são sintéticos, nunca contrato oficial homologado.

Fontes primárias e limites estão linkados no guia. O SDK depende da conta/escopos e a versão é por endpoint. Conteúdo primário indexado sustentou assinatura, parâmetros, versionamento e erros; páginas abertas diretamente retornaram shell JavaScript. Não presumimos wire response de token, TTL fixo, categoria, elegibilidade ou versão global.

Integração pelo coordenador: obter SDK/OpenAPI real da aplicação/loja US, parser de get/refresh token e secretstore com exclusividade distribuída; importador trusted de snapshots oficiais; mapper específico de categoria/condicionais; posteriormente ledger/review/monitor e piloto por versões autorizadas. Checksum protege integridade e não certifica autenticidade da origem. HTTP code 0/schema passando não é evidência de publicação ou comprabilidade. S10-03/04/05 provisionadas parcialmente, homologação externa pendente.
