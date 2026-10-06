# Operação e execução autônoma — 05/10/2026

A autorização para iniciar todas as sprints cobre a implementação e as migrations necessárias. O backlog S4–S12 continua sendo o contrato de aceite: código local não equivale a homologação de conta ou publicação aceita. A aplicação segue sem autorização por SKU para publicar produtos reais.

## Acesso e usuários

O banco ainda tem zero usuários Auth e dois prelistings sem identidade. Não foram criados usuários fictícios nem atribuídos proprietários presumidos. Informe os e-mails dos usuários e o proprietário dos registros antigos. Atualmente o catálogo é privado por owner dentro da organização: revisores e administradores aprovam os produtos do próprio escopo. Compartilhar o catálogo entre membros exige implementar memberships/RLS e testar a colaboração; esta decisão permanece em S4-03.

Os papéis vêm exclusivamente de `app_metadata.prelisting_roles`: `operator` prepara; `reviewer` prepara/aprova; `admin` prepara/aprova/publica quando a publicação está habilitada e a versão está pronta. O gateway antigo recebe somente papel operador; o modo local de desenvolvimento é admin e não funciona em produção.

`npm run auth:provision -- --email EMAIL --role admin --organization UUID` faz somente preflight. Para aplicar: acrescente `--apply`; para um usuário novo, também `--invite`. Defina `PRELISTING_APP_URL` HTTPS e inclua `/auth/complete` nas Redirect URLs do Supabase Auth. O convite abre a definição de senha pelo usuário. O script guarda uma evidência com IDs/papel, sem senha/token. A política SMTP e os limites de envio precisam ser conferidos na conta antes do convite real.

Logout revoga a sessão no Supabase. Cada API autenticada consulta a existência da sessão; o JWT sozinho deixa de ser suficiente após revogação. A RPC `prelisting_session_active()` precisa ser SECURITY DEFINER para consultar `auth.sessions`, mas só retorna um booleano da própria sessão/usuário, sem argumentos nem leitura de outros usuários. O advisor sinaliza esse EXECUTE intencional; testes negativos e `search_path` vazio sustentam a exceção. A antiga `rls_auto_enable()` deixou de ser executável por anon/authenticated.

## Catálogo e controle de IA

A prévia completa retornou 203 registros válidos: 22 pais, 107 filhos e 74 standalone. Isso valida normalização e contagem, sem confirmar elegibilidade, fatos físicos ou aprovação Amazon. Não foi feita importação produtiva sem um proprietário real. Famílias entram com relação Parent/Child, mas sem tema Amazon inventado.

Cada alteração de um produto com owner/org captura o snapshot na mesma transação, em `catalog_versions`. O histórico não permite UPDATE/DELETE pelo service_role e fica disponível no editor. O fingerprint MD5 serve para identificar snapshots internos; não substitui o SHA-256/HMAC da aprovação de publicação. O histórico não é um backup completo do banco.

`PRELISTING_AI_DAILY_OPERATIONS` limita as reservas por organização/dia UTC (padrão 200), incluindo tentativas malsucedidas. Cada geração usa até duas chamadas e a classificação até uma; o SDK não repete chamadas por conta própria. Limites de entrada/saída reduzem exposição de custo. São registrados modelo/tokens retornados pela API; custo em dinheiro ainda depende de preços vigentes e não é apresentado como um valor medido. Uma chamada que falhou sem retornar usage pode ter consumo não informado. O limite não substitui o teto de gastos na conta OpenAI. As rotas antigas de geração também passam pela reserva.

Cancelar um lote impede os próximos itens e não ressuscita um job cancelado no checkpoint. O item já em execução pode terminar e salvar. Retomada/retry precisa consultar os resultados e a versão salva; não repita publicações de estado incerto. Cada envio individual guarda payload/conta/marketplace antes da chamada. Uma versão `submitting`/`unknown` impede outras versões do mesmo SKU. A ação de reconciliação compara todos os atributos enviados com readback; se não houver correspondência, mantém o bloqueio. Correspondência pode comprovar que os atributos já existem, mas não que aquela requisição específica os gravou. Produtos com atributos normalizados diferentemente pela Amazon podem exigir investigação manual.

## Credenciais por canal

Amazon: siga `AMAZON-API-SETUP.md`; o diagnóstico real ainda retorna LWA HTTP 400 `invalid_grant`. Corrija o refresh token da mesma aplicação privada e conta seller. O sistema busca identidade exata por GTIN/ASIN, mostra classificações oficiais e estima tarifas via Product Fees. A busca não vincula ASIN automaticamente nem confirma dados físicos. `Preparar feed Amazon` produz JSON_LISTINGS_FEED v2.0 somente de versões prontas/aprovadas; o pipeline Feeds API está implementado, mas envio real segue desabilitado. Habilitar `PRELISTING_ENABLE_PUBLICATION=true` e `PRELISTING_ENABLE_FEEDS=true` somente após o piloto aceito. A interface exige revisão do manifesto; reservas são transacionais por lote/SKU, upload usa URL assinada sem persistir/logar o segredo, e relatório resolve cada mensagem. O worker consulta lotes a cada minuto. Timeout após createFeed deixa o lote incerto e bloqueia reenvio. Falhas comprovadas antes de createFeed ainda não têm retry automático da mesma reserva.

eBay: em [eBay Developers](https://developer.ebay.com/), obtenha Production Application Keys (App ID/client ID e Cert ID/client secret). Em User Tokens/eBay Sign-In, autorize o seller e obtenha o refresh token da mesma aplicação. Configure `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`, `EBAY_REFRESH_TOKEN`; `EBAY_OAUTH_SCOPES` é opcional e não pode ampliar os escopos da autorização original. O backend renova/cacha tokens e consulta Taxonomy. Inventory/Offer/policies e publicação de famílias continuam em S10-01. [Referência oficial de autorização](https://developer.ebay.com/develop/guides/sell/authorization).

Walmart: acesse o [portal de desenvolvimento Marketplace](https://developer.walmart.com/us-marketplace/), usando a conta Seller Center aprovada, e gere as credenciais de API para integração própria. Configure `WALMART_CLIENT_ID`, `WALMART_CLIENT_SECRET` e a versão Get Spec vigente da conta em `WALMART_SPEC_VERSION`. O backend usa client_credentials e renova o access token. Taxonomy/Get Spec são preparação; feed de itens, processamento e publicação continuam em S10-02. [Token API oficial](https://developer.walmart.com/us-marketplace/reference/tokenapi).

TikTok Shop ainda exige aplicação/parceiro autorizado e desenvolvimento do conector S10-03; o sistema informa que está indisponível. A matriz de capacidades impede apresentar token configurado como publicação homologada. Não envie secrets pelo chat: guarde no `.env` local ignorado ou no secret store da hospedagem.

## Produção, worker e verificação

`compose.yaml` separa web e worker, reinicia processos, força sessões reais na web e limita a porta ao loopback para usar um reverse proxy HTTPS. A imagem usa Node 22 e usuário sem root; segredos/artifacts/backups não entram no build. `PRELISTING_REVIEW_SECRET` deve ser permanente e secreto; rotação invalida aprovações antigas. `.env.example` contém somente nomes e valores públicos/padrões.

O Docker Desktop está instalado, mas o daemon Linux estava parado durante a verificação: a imagem/Compose ainda não foram testados em containers. Sem destino/conta de hospedagem não houve deploy. Antes de produção, executar `docker compose build`, configurar HTTPS/SMTP/redirects/secrets, iniciar `docker compose up -d`, testar restart do worker com um lote seguro e validar duas sessões reais. `/api/health` informa apenas que a web está viva; não é prova de saúde das integrações.

A workflow `.github/workflows/verify.yml` executa instalação travada, typecheck, testes, build e audit em PR/push. A execução local não comprova que a workflow rodou no GitHub. Revisar migrations/remoto em staging antes de releases. O histórico remoto foi conferido via MCP; os nomes locais usam as versões efetivamente aplicadas.

Backup operacional precisa de backup/PITR conforme plano Supabase, exportação protegida e ensaio de restauração em projeto separado. Restaurar a produção pode sobrescrever dados e não será usado como teste. S11-04 não é concluída por existir histórico de produto. O painel de saúde consulta ledgers duráveis: filas, reservas expiradas, erros recentes, feeds e claims incertos. Alertas externos e Notifications/SQS ainda precisam de implementação/homologação. Feeds e PATCH estão implementados sem homologação real.

## Treinamento e rollout

1. Ler a fonte e revisar a prévia; separar serviços e ofertas customizadas.
2. Importar usando a identidade real definida para a operação.
3. Confirmar origem/material/embalagem/identificadores com evidência; registrar falta de informação.
4. Buscar identidade e categorias oficiais; selecionar tipo/categoria e carregar o schema.
5. Preparar copy/mídia; resolver todos os bloqueios e executar o preview Amazon.
6. Revisar a versão e aprovar no papel adequado; alterar conteúdo exige nova revisão.
7. Realizar piloto representativo com autorização por SKU/versão; consultar processamento e comprabilidade.
8. Conferir tarifas/custos/logística, marketing e tracking antes do lançamento operacional.
9. Expandir em lotes após aceite do piloto, acompanhando exceções e alterações da loja.

Dados faltantes, contas/roles, permissões comerciais e aceite humano permanecem dependências reais. O relatório `EXECUTION-005.md` distingue entregas de código, validações locais, homologações e pendências de cada sprint.

## Revisão em lote e atualizações de oferta

Selecione até 100 SKUs para revisar. Expanda cada produto e confira fatos, mídia, copy, atributos e bloqueios; marque somente versões efetivamente revisadas. O servidor revalida papel, família, hash e updated_at por item. Versões alteradas não são aprovadas e retornam resultado individual. A tela não aprova automaticamente toda a seleção.

Para um SKU aprovado existente, prepare preço e/ou estoque FBM, confirme o PreListing como fonte autorizada e revise o manifesto. `PRELISTING_ENABLE_OFFER_PATCH=true` libera o envio apenas junto ao gate geral de publicação/papel admin. PATCH merge limita-se aos atributos escolhidos, com seletores explícitos; estoque FBA e ofertas de pai são bloqueados. A confirmação de autoridade fica no target do ledger. Não há rollback automático nem sincronização contínua de estoque; reconciliação estrita pode exigir investigação se Amazon normalizar/expandir atributos. Referência: [Manage purchasable offer](https://developer-docs.amazon/sp-api/lang-us/docs/manage-purchasable-offer).

Lote `failed` sem feedId permite **preparar nova tentativa para revisão** somente se o manifesto/versão/conta permanecerem idênticos. O banco exige que todos os claims comprovem falha anterior ao início de createFeed. A nova tentativa tem ID/número próprios e preserva as anteriores; não há retry automático de publicação. Resultado `unknown`, chamada createFeed iniciada, alteração de versão ou tentativa posterior bloqueiam. Cada resultado do relatório grava ledger e projeção de status do produto em uma transação; a projeção é omitida se a versão mudou e não rebaixa claim já reconciliado.

Avisos de listings: configurar EventBridge→SQS e duas DLQs conforme `AMAZON-API-SETUP.md`. `npm run amazon:notifications` consulta a versão atual do SKU e remove mensagem apenas após concluir o registro durável. Duplicadas completas são idempotentes; inválidas/sem marketplace/SKU/falhas de leitura ficam para retry/DLQ. O painel mostra eventos próprios com falha; alarmes e redrive das DLQs dependem da infraestrutura AWS, ainda não ativada. Não usar eventos para reenviar listings ou modificar fatos/preço/estoque automaticamente.

Conteúdo específico: no editor de cada canal, salvar/gerar título, bullets, descrição e keywords em inglês US. Sem copy específica usa-se o conteúdo base. IA grava grounding no canal escolhido e não reescreve os fatos/base nem o texto do outro canal. Fatos/identidade/oferta continuam compartilhados; aprovação tem hash do texto efetivo e requisitos do canal. Não tratar este incremento como suporte a todos os idiomas.

eBay inicial: configurar OAuth Inventory/Account/Metadata e acesso à [Identity API](https://developer.ebay.com/develop/guides/sell/other-apis-guide) com `commerce.identity.readonly`, além de `EBAY_ACCOUNT_ID` igual ao userId imutável obtido dessa API. O acesso Identity depende da aplicação/permissões eBay; não usar um username mutável. Preparar SKU standalone, condição NEW, embalagem, identidade Brand/MPN ou GTIN, aspectos/policies/localização e copy ≤80 caracteres de título. Aprovar, preparar manifesto, conferir a conta e gestão exclusiva do SKU; habilitar `PRELISTING_ENABLE_EBAY_PUBLICATION=true` junto ao gate geral somente para o piloto autorizado. `PUT inventory_item` pode revisar listings existentes, por isso este executor bloqueia qualquer inventário/oferta preexistente. Excluir escritores concorrentes de outros sistemas nesse namespace de SKU, pois a API não fornece reserva atômica contra eles neste fluxo.

Checkpoints eBay preservam estágio/offerId/listingId. Uma resposta publish bem-sucedida fica `accepted` até readback comprovar payload e oferta publicada. Após timeout com offerId confirmado, consultar o envio; sem offerId, investigar no Seller Hub sem reenviar/criar oferta automaticamente. Readback é conservador e pode exigir investigação se eBay normalizar campos. Não há compensação automática, atualização de listings preexistentes ou famílias nesta entrega. Ações reais eBay ainda não foram executadas/homologadas.

A comparação da fonte só informa ausentes quando uma leitura completa e válida foi concluída. Arquivo parcial não implica remoção. Ausência exige revisão humana; nada é arquivado automaticamente.

## Evidências privadas de produto

No editor, envie PDF, PNG ou JPEG de até 5 MB. O bucket `prelisting-evidence` é privado, com acesso server-only; nenhuma URL pública permanente é criada. O ID/SHA-256 da versão pode ser registrado na fonte da confirmação dos fatos. Download autenticado exige produto ativo e confere tamanho/hash, servindo como attachment com no-store/nosniff/sandbox. Upload é imutável pela API (novo ID/path, upsert false); pending recupera somente se bytes correspondem ao hash reservado. Sem remoção automática nem upload real de teste sem owner.

A checagem de PDF verifica cabeçalho/final e imagens usam Sharp/limite de pixels; não existe scanner antimalware instalado. Abrir documentos e aprovar evidências continua exigindo equipe e política operacional. Não use Storage privado como imagem pública de listing: publicação de assets para marketplaces é uma etapa separada ainda pendente. GTIN/MPN fornecidos exigem confirmação de provenance.

Preparação eBay: selecione categoria e consulte policies/condições no editor. Registre IDs reais de Payment/Return/Fulfillment Policies, merchantLocationKey e condição NEW; pacote standalone separa InventoryItem/Offer e limita título a 80 caracteres, com descrição tratada como texto. Para essas leituras, o grant precisa dos escopos apropriados de Account/Inventory/Metadata; obtenha-os no portal eBay com autorização do seller. A consulta não cria policies nem ativa ofertas. Famílias ainda não foram implementadas; publish/readback standalone inicial está preparado, desligado e sem homologação real. [Fluxo oficial eBay](https://developer.ebay.com/api-docs/sell/static/inventory/inventory-item-to-offer.html).

## Orçamento monetário da IA

`PRELISTING_AI_DAILY_USD` opcional ativa reservas conservadoras por organização/dia UTC, somadas atomicamente junto ao limite de operações. Vazio mantém só a quota de operações. Reservas não são devolvidas por falha/timeout nem reduzidas pelo usage, evitando abrir saldo com consumo desconhecido. Runtime permite no máximo duas calls de geração/uma classificação, com saída limitada e entrada/contexto conferidos antes da chamada. O painel mostra valores deste owner; acima de 1.000 operações informa amostra parcial, não orçamento restante da organização.

Para gpt-4o-mini/snapshot conhecido, a tarifa observada em 05/10/2026 foi USD0,15 input/1M e USD0,60 output/1M, contexto128k. [Modelo/preço oficial](https://developers.openai.com/api/docs/models/gpt-4o-mini). Tabela vence em30 dias; configure `PRELISTING_AI_PRICING_JSON` com model, input_usd_per_million, output_usd_per_million, max_context_tokens, checked_at ISO e source ao revisar tarifas ou usar outro modelo. Com cap USD ativo, tarifa ausente/vencida bloqueia novas calls. Usage retornado estima custo a tarifa uncached (sem desconto de cache); falhas podem ter custo desconhecido. Reservas/estimativas são controles da aplicação e não fatura nem garantia do limite de gastos do provider.

Se createFeed iniciou e o ID foi perdido, o administrador deve identificar o documento/horário/SKUs/manifesto no Seller Central e registrar evidência na recuperação de ID. A aplicação confere tipo/marketplace/janela temporal, mas depende do atestado humano para associar aquele feed ao documento; não adivinhe o ID. Só depois retome o monitor/relatório.

## Antimalware das evidências

Configurar `PRELISTING_CLAMD_HOST` e `PRELISTING_CLAMD_PORT=3310` para clamd em rede privada, com acesso apenas do web/worker. O protocolo TCP não tem autenticação: não expor a porta na internet. Manter engine e freshclam atualizados, StreamMaxLength/limites de scan compatíveis com os 5 MB permitidos, e política para arquivos criptografados/limites excedidos. Validar EICAR e arquivos válidos no ambiente de staging antes de liberar. Não foi instalado um scanner por esta implementação. [Operação oficial ClamAV](https://docs.clamav.net/manual/Usage/Scanning.html).

Upload somente após resposta completa OK e base de assinaturas comprovada com no máximo 72h. O receipt registra engine/base/data. Download confere SHA-256 e reanalisa após 24h ou base vencida; FOUND bloqueia a versão, falha/timeout não libera o arquivo. Sem scanner configurado, produção bloqueia novos uploads e downloads que exigem scan. `PRELISTING_ALLOW_UNSCANNED_EVIDENCE=true` é exceção explícita somente fora de produção, gravada como skipped, sem declarar arquivo limpo. A análise não confirma a validade comercial de certificados.

## Economia e revisão de marketing

No produto, abrir Economia e marketing; preencher sete custos USD, fonte e data reais, inclusive zeros confirmados. O preço/estoque são lidos do catálogo. Salvar cria/atualiza perfil em rascunho com guarda de versão; recarregar em conflito antes de sobrescrever. Fonte/data faltantes, margem de outro preço, datas inválidas/futuras e destino sem identidade do produto bloqueiam a aprovação.

Gerar os planos, abrir o conteúdo completo da revisão, conferir produto/custos/campanhas/tracking e confirmar a versão. Admin/reviewer registra decisão com comentários; snapshot/hash/assinatura vinculam a aprovação. Qualquer mudança relevante exige nova revisão; aprovação antiga não libera conteúdo novo. Decisão e status são uma única transação. A leitura mostra aprovação pendente quando o hash não confere, mesmo se o status histórico armazenado era launch_ready.

Destinos deste fluxo são páginas de produto HTTPS Amazon US do ASIN atual; não usar homepage, encurtador ou outro SKU. Attribution só deve ser marcado disponível após elegibilidade e validação externas. Export JSON/Markdown contém snapshot e prova de aprovação corrente. Confirmação de Kanban interno exige expected_hash atual e gera chave por versão; não cria tarefas em aplicação externa nem campanhas/gastos.

## Arquivar e restaurar preparações

Abrir o produto, conferir versão/motivo e confirmar Arquivar. Exige admin, sem edições locais pendentes. Reservas de envio ativo/incerto ou feed em processamento bloqueiam a transição; reconciliar antes. A ação retira o registro da preparação e conserva histórico, sem apagar listings nos marketplaces. Na central, Preparações arquivadas permite consultar e restaurar com nova confirmação/motivo. Produto restaurado volta a draft sem aprovação anterior.

A API antiga DELETE /api/listings agora exige JSON com sku, expected_version, reason e confirm=true; clientes que arquivavam só pelo querystring devem migrar para POST /api/catalog/archive com archive=true. Nenhuma versão produtiva foi arquivada.

## Retomar lotes de preparação

Em lote terminado/cancelado, Preparar nova tentativa mostra falhas finais e entradas ainda não processadas. Escolher o escopo, conferir e confirmar. Cria lote filho com id/checkpoints próprios, mantendo o original; repetições do mesmo parent/scope retornam o mesmo filho. Ações consultam as versões atuais dos produtos; importação conserva o snapshot revisado do lote original. Produtos arquivados não são ressuscitados por esse fluxo. Se o filho falhar novamente, investigar e retomar a partir dele. Operações de IA continuam submetidas às quotas e reservas de custo.

PUT/PATCH Amazon exigem reserva transacional da versão; resposta sem ACCEPTED/INVALID fica incerta. Não interpretar ausência/erro de transporte como rejeição. Monitoramento só marca a versão atual vendável quando todos os atributos esperados coincidem, BUYABLE está presente e não há ERROR; normalizações divergentes exigem investigação. Marketing também exige preparação aprovada/prova da versão atual antes de launch_ready.

Tracking conserva attribution_tag e attribution_status. Informar tag registra configured_unverified; elegibilidade/atribuição não foram comprovadas. Configuração é privada do owner/org e faz parte da versão revisada. O evento deste fluxo continua OutboundClick.

Lista de marketing: páginas de 20, somente produtos ativos do mesmo tenant/owner; abrir o perfil para custos e revisão. Estados launch_ready são revalidados na consulta.

Docker Desktop foi iniciado localmente, mas engine/status não responderam. Não houve build de imagem, container ou deploy. Runner agora copia dependências de produção; tsx é runtime para os workers. Validar a imagem, health, restart, limites e secrets no destino real antes da liberação.

Antes de PATCH de oferta, confirmar ASIN existente no produto/manifesto. O readback deve devolver SKU, marketplace e ASIN idênticos; divergência bloqueia a atualização antes da reserva/escrita. Para publicação inicial, usar o fluxo de listing.

Prévia local encerrada em modo de identidade de teste. Servidor de desenvolvimento limitado a 127.0.0.1:3100 agora exige supabase-session/local-only=false; navegador confirmou /login (artifacts/catalog-auth-session-preview.png). Nenhum usuário/owner fictício foi criado no banco. Login operacional aguarda os e-mails reais já solicitados.
