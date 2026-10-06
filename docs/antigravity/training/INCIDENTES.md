# Incidentes, retomada e reautorização

Use o [guia por papel](OPERADOR.md). Registre decisão, UTC/local, SKU/hash/versão e ID de correlação no [template de sessão](SESSAO.md). Nunca incluir segredo ou URL assinada nas evidências.

| Sintoma | Encaminhamento e evidência necessária |
|---|---|
| Fato/identidade/documento ausente | FBR fornece fonte real; operador mantém pendência, sem completar por IA |
| `invalid_grant` Amazon | Administrador reautoriza a mesma aplicação privada/conta; conferir account/marketplace e diagnóstico, sem compartilhar token |
| Categoria/schema pendente ou vencido | Consultar conector oficial, carregar requisitos atuais, validar novamente e revisar versão |
| Conflito de versão | Recarregar produto/manifesto, comparar mudanças e repetir revisão, nunca reaproveitar confirmação |
| Imagem/arquivo privado bloqueado | Resolver fidelity/direitos ou scanner/rescan; não desativar scanner para desbloquear |
| Job cancelado/lease perdida | Conferir cursor/resultados; ação em voo pode terminar; não assumir rollback |
| Checkpoint inválido | Investigar payload/cursor/results; novo lote válido, sem reprocessar indefinidamente o corrompido |
| `submitting`/`unknown` após timeout | Consultar ledger e canal; manter bloqueio até reconciliação, sem PUT/publish repetido |
| Feed failed comprovado antes createFeed | Preparar retry explícito de mesmo manifesto/conta/versões; revisar nova tentativa |
| Feed unknown sem feedId | Investigar histórico externo; ausência do ID local não prova que createFeed falhou |
| eBay sem offerId | Consultar candidatos readonly; administrador confirma conteúdo/conta/ledger e atesta propriedade; associação preserva unknown até readback |
| Prova BUYABLE vencida/ERROR | Consultar Amazon novamente; erro bloqueante, SKU/marketplace/hash divergente não liberam marketing |
| Autoridade preço/estoque pausada/expirada | Decisão administrativa motivada para versão/campos corretos; novo manifesto revisado |

## Reconciliação de envio incerto

1. Registrar conta, marketplace, SKU, versão original e estágio do ledger. Não modificar manualmente SQL para trocar unknown por published.
2. Consultar monitor/readback no mesmo escopo. Correspondência comprova estado atual; não necessariamente a autoria da chamada original.
3. Se o canal normalizou atributos e comparação estrita falha, preservar bloqueio e investigar diferença. Não remover seletores/checks para obter verde.
4. Feed: relatório resolve por messageId; lançamento parcial não libera indiscriminadamente todos os itens. Associação administrativa de feedId exige evidência e versão do ledger quando disponível.
5. eBay: aceitar somente candidato de mesma conta, SKU e snapshot exato, lista completa e atestado administrativo. Registrar offerId não executa publish e não elimina incerteza automaticamente.
6. Depois de comprovada resolução, decidir correção/revisão/reautorização da versão seguinte. A ação não dispensa os gates de publicação do piloto.

## Restaurar ambiente

Antes de web/workers conectarem ao banco restaurado, o administrador configura `PRELISTING_RECOVERY_MODE=true` em **todos** os processos e reinicia com configuração consistente. O switch é explícito e não detecta restores. Novos envios/jobs de preparação ficam bloqueados; consultas/monitores, Fees e VALIDATION_PREVIEW permanecem disponíveis.

Restaurar somente em projeto separado durante ensaio. Verificar backup/PITR e armazenamento privado conforme infraestrutura realmente contratada. Registrar último ponto recuperado, início/fim da recuperação e diferenças externas. Eventos/submissões que ocorreram após o ponto restaurado podem não constar no banco: pesquisar o histórico do marketplace antes de liberar qualquer reenvio.

Após reconciliar versões/ledgers/filas, conferir conta/marketplace, sessões, scanner e secrets nos processos. Decisão administrativa documentada libera recovery em todos os processos; flags de publicação continuam dependentes do piloto. RPO/RTO são medidos no ensaio aprovado, não deduzidos do teste local de restart nem definidos por este manual.

## Quando suspender um caso

Fato físico ausente, owner indefinido, contrato oficial indisponível, resposta incompleta, inconsistência de conta, envio incerto ou infraestrutura sem evidência impede a etapa dependente. Registre a causa exata e avance outra preparação independente. Não transforme bloqueio do caso em aceite geral, nem em interrupção de todo o backlog de código.
