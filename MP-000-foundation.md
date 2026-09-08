# MP-000 — Fundação do Projeto: FBRSigns PreListing + Marketing Readiness

## Status
`FUNDACAO` | aprovado

## Resumo do PRD
O PreListing é uma aplicação Next.js para preparar produtos da FBRSigns para marketplaces americanos, especialmente Amazon US. O sistema captura fatos do produto, referência pública, copy, atributos, logística, compliance, mídia e exportação CSV/JSON.

A expansão Marketing Readiness agregará ao produto aprovado os dados necessários para planejar Amazon PPC, Meta Ads, tracking, criativos e lançamento. O módulo deverá gerar planos auditáveis e cards para o Kanban da FBR Agency, sem publicar campanhas ou gastar verba automaticamente.

## Decisões de Arquitetura

- Stack atual: Next.js 15, React 19, TypeScript, Tailwind CSS 4.
- Backend atual: Route Handlers do Next.js em runtime Node.js.
- Persistência atual: Supabase/Postgres, tabela `prelistings`, payload principal em JSONB.
- Padrão: monólito modular; o módulo Marketing ficará dentro do mesmo projeto, separado por domínio.
- Frontend: nova área `/marketing` e páginas de planejamento por SKU.
- Backend: rotas `/api/marketing-profiles`, `/api/amazon-campaigns`, `/api/meta-campaigns`, `/api/tracking-plans` e `/api/kanban`.
- Integração FBR Agency: criação de tarefas no Kanban por CLI ou endpoint controlado; nenhuma publicação automática na primeira versão.
- Exportações: JSON e Markdown na primeira versão; CSV específico de plataforma somente quando o contrato de exportação estiver definido.
- Amazon Ads API e Meta Marketing API ficam fora da primeira entrega. A primeira versão gera planos e briefings revisáveis.
- Fonte de verdade física: dados aprovados do PreListing, catálogo/produção FBRSigns e evidências classificadas. Referência de concorrente não pode virar fato da FBRSigns sem aprovação.
- Decisão confirmada por Sergio: o tráfego inicial da Meta direcionará para a página do produto na Amazon.
- Primeira fase: o sistema atende somente a FBRSigns.
- Meta Ads: cada produto terá sua própria Business Manager/ad account conforme a operação definida por Sergio; o produto/campanha precisa registrar essa identificação.
- Economia: o sistema armazenará margem real, com seus componentes de custo e data de cálculo, não apenas uma faixa estimada.
- Persistência oficial: Supabase/Postgres.
- Implicação de tracking: não haverá Pixel/CAPI de compra dentro da Amazon. O módulo deve registrar clique de saída e preparar Amazon Attribution quando a conta/produto forem elegíveis.
- Suposições ainda não confirmadas: existência de autenticação de usuário, projeto Supabase de produção, formato final do payload do Kanban e credenciais futuras das APIs de anúncios.

## Schema de Banco de Dados

A tabela existente permanece. As tabelas novas terão `sku` como referência lógica e `prelisting_id` como relação quando disponível.

```sql
create table if not exists public.product_marketing_profiles (
  id uuid primary key default gen_random_uuid(),
  prelisting_id uuid references public.prelistings(id) on delete cascade,
  sku text not null unique,
  status text not null default 'draft',
  objective text,
  audience jsonb not null default '{}'::jsonb,
  purchase_motivations jsonb not null default '[]'::jsonb,
  objections jsonb not null default '[]'::jsonb,
  approved_claims jsonb not null default '[]'::jsonb,
  prohibited_claims jsonb not null default '[]'::jsonb,
  economics jsonb not null default '{}'::jsonb,
  source_provenance jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.amazon_campaign_plans (
  id uuid primary key default gen_random_uuid(),
  marketing_profile_id uuid not null references public.product_marketing_profiles(id) on delete cascade,
  sku text not null,
  status text not null default 'draft',
  plan jsonb not null default '{}'::jsonb,
  approval_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.meta_campaign_plans (
  id uuid primary key default gen_random_uuid(),
  marketing_profile_id uuid not null references public.product_marketing_profiles(id) on delete cascade,
  sku text not null,
  status text not null default 'draft',
  plan jsonb not null default '{}'::jsonb,
  approval_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tracking_plans (
  id uuid primary key default gen_random_uuid(),
  marketing_profile_id uuid not null references public.product_marketing_profiles(id) on delete cascade,
  sku text not null,
  status text not null default 'draft',
  events jsonb not null default '[]'::jsonb,
  utm_rules jsonb not null default '{}'::jsonb,
  destination_url text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.marketing_tasks (
  id uuid primary key default gen_random_uuid(),
  marketing_profile_id uuid not null references public.product_marketing_profiles(id) on delete cascade,
  sku text not null,
  kanban_task_id text,
  agent text not null,
  task_type text not null,
  status text not null default 'pending',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

| Tabela | Dono provável | Depende de |
|---|---|---|
| `prelistings` | PreListing existente | nenhuma |
| `product_marketing_profiles` | MP-001 Marketing Profile | `prelistings` |
| `amazon_campaign_plans` | MP-002 Amazon PPC | `product_marketing_profiles` |
| `meta_campaign_plans` | MP-003 Meta Ads | `product_marketing_profiles` |
| `tracking_plans` | MP-004 Tracking | `product_marketing_profiles` |
| `marketing_tasks` | MP-005 FBR Agency Handoff | `product_marketing_profiles` |

## Estrutura Inicial de Arquivos

```text
app/
├── marketing/
│   ├── page.tsx                         # lista produtos e readiness
│   └── [sku]/
│       ├── page.tsx                     # painel de marketing do produto
│       ├── amazon/page.tsx              # plano Amazon PPC
│       └── meta/page.tsx                # plano Meta Ads
├── api/
│   ├── marketing-profiles/route.ts      # CRUD do perfil de marketing
│   ├── amazon-campaigns/route.ts        # plano Amazon PPC
│   ├── meta-campaigns/route.ts          # plano Meta Ads
│   ├── tracking-plans/route.ts          # eventos e UTMs
│   └── kanban/route.ts                  # handoff controlado para FBR Agency
├── lib/
│   ├── marketing/                       # validações e regras de domínio
│   └── kanban/                           # serialização de cards
└── supabase-marketing-schema.sql        # migração das tabelas do módulo
```

## Dependências

| Pacote/Serviço | Tipo | Custo | Alternativa free/open-source considerada |
|---|---|---:|---|
| Next.js/React/TypeScript | existente | atual | já usado |
| Supabase/Postgres | existente | conforme plano | Postgres self-hosted |
| Zod | validação futura | free/open-source | validação manual existente |
| Hermes Kanban CLI | integração operacional | local | arquivos Markdown, somente fallback |
| Amazon Ads API | futuro | conforme conta | plano/exportação manual |
| Meta Marketing API | futuro | conforme conta | plano/exportação manual |

## Variáveis de Ambiente

| Nome | Propósito | Obrigatória? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL do Supabase | sim para persistência remota atual |
| `SUPABASE_SERVICE_ROLE_KEY` | gravação server-side | sim para persistência remota atual |
| `OPENAI_API_KEY` ou provider equivalente | geração assistida existente | conforme uso da IA |
| `AMAZON_ADS_CLIENT_ID` | futura integração Amazon Ads | não na primeira versão |
| `AMAZON_ADS_CLIENT_SECRET` | futura integração Amazon Ads | não na primeira versão |
| `META_ACCESS_TOKEN` | futura integração Meta | não na primeira versão |
| `META_AD_ACCOUNT_ID` | futura integração Meta | não na primeira versão |
| — | Amazon Attribution será armazenado por produto/campanha em `tracking_plans`, não como segredo global | não na primeira versão; usar quando elegível |
| `HERMES_KANBAN_BOARD` | board de handoff | não; usar `fbr-agency` como default |

## Critérios de Fundação Pronta

- [ ] Schema atual e tabelas novas revisados.
- [ ] Cada tabela nova possui um único Mini PRD dono.
- [ ] Campos derivados são separados dos fatos físicos do PreListing.
- [ ] Amazon PPC e Meta Ads permanecem como planos revisáveis na primeira versão.
- [ ] Nenhuma integração de publicação ou gasto é automática por padrão.
- [ ] Handoff para o Kanban possui contrato definido.
- [ ] Sergio aprovou explicitamente esta fundação.

## Riscos e Perguntas em Aberto

- O Supabase atual está pronto para receber as novas tabelas ou a primeira versão deve usar somente JSON/localStorage?
- O Marketing Profile deverá suportar múltiplos clientes no futuro ou somente FBRSigns nesta fase?
- Qual será o formato de criação de cards no Kanban: CLI local, script Node ou endpoint Hermes?
- O módulo deverá armazenar margem real ou apenas uma faixa aprovada?
- A conta/produto estará elegível para Amazon Attribution quando o primeiro produto for aprovado?
- Os templates oficiais de Amazon PPC e Meta serão importados posteriormente ou permanecerão como planos Markdown/JSON inicialmente?
