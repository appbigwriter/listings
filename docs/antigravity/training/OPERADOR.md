# Guia operacional por papel

Versão documental 1, 06/10/2026. Este guia descreve fluxos implementados; execução local e documentos não substituem homologação com contas, produtos e usuários reais. Consulte [operações do projeto](../../../OPERATIONS-005.md), [retomada 009](../../../EXECUTION-009-retomada.md) e [matriz piloto](../pilot/MATRIZ.md).

## Acesso e responsabilidade

Entre com sua sessão em `/login`; convite recebido por canal confiável permite definir senha em `/auth/complete`. Nunca compartilhar senha, cookie, refresh token ou `.env`. O administrador provisiona e-mails/papéis reais segundo decisão da FBR. Não criar identidades fictícias na produção para completar o treinamento. Após logout, a sessão revogada deve perder acesso às APIs.

| Papel | Ação permitida no escopo atual |
|---|---|
| operator | Preparar catálogo, executar consultas e validar rascunhos |
| reviewer | Preparar e aprovar versões elegíveis do próprio owner/org |
| admin | Preparar/aprovar, gerir arquivamento/autoridade/recuperação e publicar versões autorizadas quando os gates estiverem habilitados |

Papéis vêm do servidor (`app_metadata.prelisting_roles`). Produtos são isolados por **owner e organização**: ser revisor/admin da organização não torna visíveis os produtos de outro proprietário. Definir processo de revisão compartilhada exige resolução de S4-03, não empréstimo de conta ou mudança manual de owner. Atribuição dos dois registros legados depende da decisão real da FBR.

## Preparar um produto

1. Em `/catalog`, consulte a prévia da fonte e confira contagens, SKUs, relações pai/filho e serviços. Importação exige identidade responsável definida; não importa aprovação do marketplace nem fatos confirmados.
2. Abra `/catalog/<SKU>` e confira elegibilidade física/custom/serviço. Serviços ficam fora do fluxo padrão. Amazon Custom exige habilitação real e FBM; não inferir elegibilidade da descrição.
3. Confirme marca, origem, material, embalagem e identificadores usando ficha, documento ou medição real. Valores ausentes ficam pendentes. Uma sugestão de IA ou de fonte externa não é evidência de dado físico. Registre origem e motivo das decisões de reconciliação da loja.
4. Busque identidade e classificações no canal. Identidade exata por ASIN/GTIN não vincula produto automaticamente. Escolha categoria/tipo oficiais e carregue requisitos. Confira checksum, data e pendências. Expiração de requisitos exige atualização e nova validação.
5. Prepare copy inglês por canal; geração IA gera rascunho sustentado em fatos, não aprovação. Limites do aplicativo: título Amazon 200/eBay 80 caracteres Unicode, bullets 10.000, descrição 20.000 e keywords 2.500. Requisitos oficiais específicos podem impor limites adicionais.
6. Confira fidelidade das imagens e direitos. Upload de evidência privada exige scanner configurado e recibo válido. Falha/indisponibilidade do scanner exige corrigir infraestrutura, nunca substituir por confirmação manual de malware. URL assinada e arquivo privado não vão em logs/chats.
7. Resolva bloqueios, valide e execute preview Amazon sem publicação. `ready` significa preparação local elegível, não aprovação externa. `accepted`/`processing` não significam comprável.
8. Pais/filhos exigem tema, marca, tipo, categoria e elegibilidade compatíveis. Publicar filho isolado exige pai atual aprovado e comprovado por readback; feed de família exige pai ativo no manifesto e reserva das versões em conjunto.

Se a loja mudou, compare o snapshot e escolha aplicar ou manter com motivo. Alteração de conteúdo, requisitos ou fatos invalida a aprovação daquela versão. Não use uma aprovação antiga para corrigir um bloqueio atual.

## Revisar e aprovar

O revisor/admin abre dados, fatos, imagens, copy e requisitos, resolve todas as pendências e aprova o hash e a versão exibidos. Revisão em lote permite até 100 SKUs, mas exige marcar individualmente as versões efetivamente revisadas. Conflito de versão retorna resultado por item; recarregue, reveja o diff e reautorize. Não automatizar a confirmação de que um humano revisou.

Registre no [template de sessão](SESSAO.md) quem revisou, versão, dúvidas e evidência. Aprovação não autoriza qualquer envio futuro: o piloto também precisa de autorização por SKU/versão, conta e marketplace.

## Envio e acompanhamento

Administrador: confira conta/marketplace, manifesto, conteúdo, hash e autorização antes de confirmar envio. Flags desligadas e recovery ativo impedem publicação; habilitação operacional depende do piloto. Feed, PUT, PATCH e eBay têm confirmação específica. Nunca habilitar flags para contornar requisito pendente.

Leia ledger/resultado e consulte novamente o canal. Quando SKU, marketplace e atributos atuais correspondem, readback pode comprovar estado da versão. `BUYABLE` Amazon com ERROR não comprova comprabilidade. Prova de outra versão ou com mais de 24 horas não habilita marketing; consulte novamente. eBay `verified_published` não é o estado BUYABLE Amazon.

PATCH de preço/estoque exige autoridade do PreListing, campos, validade e versão atuais, além da confirmação do manifesto. Não transfere gestão de estoque automaticamente; oferta de pai/FBA e origem de valores incompatível são bloqueadas. Pausa/expiração da autoridade exige decisão administrativa registrada.

## Operar lotes e exceções

Monitorar central de operações, cursor/resultados e filas. Cancelar impede os próximos itens; operação já em voo pode terminar/consumir IA. Não recriar lote para repetir um envio incerto. Retry de preparação retoma itens inacabados respeitando versões e idempotência; checkpoint inválido exige investigação e novo lote válido, não loop de retry.

Use [incidentes e recuperação](INCIDENTES.md) para distinguir bloqueio factual, credencial, versão, validação externa e envio incerto. O ID de correlação pode acompanhar o chamado interno sem tokens, payload privado ou mensagens brutas do provider.

Arquivar exige administrador, versão e motivo. Preserva histórico e não remove listing publicado no marketplace. Envio ativo/incerto bloqueia arquivamento. Restaurar volta para rascunho sem aprovação anterior: preparar e revisar novamente.

## Custos e marketing

Em `/marketing/<SKU>`, confira tarifas Product Fees ligadas à conta, SKU, preço, frete, moeda, fulfillment e data corretos. Receita única agregada não deve ser somada novamente com seus componentes nem com tarifa manual. Custos físicos/logísticos dependem da FBR. USD deve ser confirmado; não realizar conversão presumida.

Prova atual de listing comprável, ficha econômica, destination e plano completos sustentam revisão. Tracking configurado ainda pode estar não verificado. Handoff revisado não cria automaticamente campanha ou gasto; operação de marketing externa precisa do aceite/autorização correspondente.

## Conclusão da sessão

Anote resultado como preparação local, consulta externa, envio autorizado, verificação externa ou pendência, conforme evidência. Saia da sessão e confirme revogação em ambiente de treinamento. Não marcar sprint, pessoa ou marketplace homologados com base em fixtures ou leitura do manual.
