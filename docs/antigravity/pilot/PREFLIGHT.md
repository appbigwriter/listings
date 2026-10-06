# Preflight do piloto e operação real

Status deste documento: checklist proposto, sem itens atestados. Os [20 casos candidatos](MATRIZ.md) e o [template JSON](casos-v1.json) são preenchidos por responsáveis reais. Use as referências de [operação](../../../OPERATIONS-005.md), [configuração Amazon](../../../AMAZON-API-SETUP.md) e [treinamento](../training/OPERADOR.md).

| Item | Evidência a registrar | Estado inicial |
|---|---|---|
| Owner/organização e usuários | E-mails/papéis aprovados, sessão revogável, decisão dos legados | Pendente de FBR |
| Conta e credenciais do canal | Aplicação autorizada, seller/account/marketplace esperado; diagnóstico sem secrets | Pendente de conta |
| Dados e políticas | Fichas físicas, identidade, direitos, elegibilidade/customização, documentos necessários | Pendente de produto |
| Ambiente e infraestrutura | Staging/destino, HTTPS, scanner, worker/supervisor, fila/notifications conforme uso | Pendente de ambiente |
| Backup/recuperação | Ensaio isolado e evidência; RPO/RTO medidos e plano de exceções | Pendente de ensaio |
| Custo IA | Modelo/versionamento, preços vigentes, quota/orçamento da org e conta | Pendente de decisão |
| Economia produto | Custos/frete USD e receipt Fees atual, margem sem somas duplicadas | Pendente de dados |
| Casos/treino | Seleção representativa real, responsável/observação por papel | Pendente de execução |
| Autorização de envio | SKUs/hash/versões, conta/marketplace, ação e decisão real documentados | Pendente de FBR |
| Aceite/expansão | Resultado observado, exceções e decisão de rollout | Pendente de avaliação |

Antes de release, `npm run migrations:verify` valida o manifesto local de migrations e tipos; não substitui consulta de drift remoto. Não reaplicar SQL já registrada. Alteração de schema segue migration nova e evidência de execução. Autorização de migrations existente não é autorização para inventar usuário ou publicar SKU.

Habilitar gates somente depois do aceite da etapa correspondente e autorização operacional; conferir configuração consistente de web/worker. Em recuperação, todas as instâncias usam `PRELISTING_RECOVERY_MODE=true` antes de conectar ao banco restaurado. Sua liberação exige reconciliação externa; apagar ledger não é resolução.

Registrar consultas, validações locais, publicação externa, marketing/handoff e campanha como etapas distintas. Tracking `configured_unverified` e HTTP accepted não significam tracking comprovado ou listing comprável. Não há anúncio/gasto implícito no piloto.
