# STATUS — FBRSigns PreListing + Marketing Readiness

| ID | Título | Depende de | Status | Dono provável |
|---|---|---|---|---|
| MP-000 | Fundação do PreListing + Marketing Readiness | nenhum | aprovado | Sergio / David |
| MP-001 | Módulo Marketing Readiness | MP-000 | implementado_verificado | David / FBR Agency |

## Fluxo previsto após aprovação da fundação

```text
MP-000 Fundação
    ↓
MP-001 Product Marketing Profile
    ├── MP-002 Amazon PPC Plan
    ├── MP-003 Meta Ads Plan
    └── MP-004 Tracking Plan
             ↓
        MP-005 FBR Agency Handoff
```

## Regra

A fundação precisa ser validada por Sergio antes da criação dos Mini PRDs executáveis e antes de qualquer implementação do módulo Marketing Readiness.

## Decisão confirmada

- Meta Ads direcionará inicialmente para a página do produto na Amazon.
- O tracking inicial será baseado em clique de saída; Amazon Attribution será usado quando estiver disponível/elegível.
- A primeira fase atende somente a FBRSigns.
- Cada produto terá sua própria BM/ad account da Meta.
- A margem real será armazenada no perfil de marketing.
- Supabase/Postgres é a persistência oficial.
