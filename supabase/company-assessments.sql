-- Mapa 360 · avaliações empresariais e distribuição de módulos
-- Destino exclusivo: projeto Supabase mapa360-dev.
-- Migração aditiva: não altera nem remove registros das estruturas existentes.
-- Aplicar somente após revisão e confirmação do esquema no projeto DEV.

begin;

create table if not exists public.m360_assessments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null
    references public.m360_companies(id) on delete restrict,
  legacy_invitation_id uuid unique
    references public.m360_invitations(id) on delete set null,
  title text not null default 'Nova avaliação'
    check (char_length(btrim(title)) between 2 and 180),
  status text not null default 'draft'
    check (status in ('draft', 'in_progress', 'completed', 'archived')),
  schema_version integer not null default 1
    check (schema_version >= 1),
  shared_payload jsonb not null default '{}'::jsonb
    check (
      jsonb_typeof(shared_payload) = 'object'
      and not (shared_payload ? 'answers')
    ),
  final_payload jsonb
    check (final_payload is null or jsonb_typeof(final_payload) = 'object'),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint m360_assessments_id_company_key unique (id, company_id)
);

create index if not exists m360_assessments_company_created_idx
  on public.m360_assessments(company_id, created_at desc);

create index if not exists m360_assessments_status_idx
  on public.m360_assessments(company_id, status);

create table if not exists public.m360_assessment_modules (
  assessment_id uuid not null,
  company_id uuid not null,
  module_id text not null
    check (module_id in (
      'geral',
      'segmento',
      'contexto_industrial',
      'ppcp',
      'automacao',
      'dados_bi',
      'administrativo',
      'projetos'
    )),
  assigned_user_id uuid references auth.users(id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'in_progress', 'completed')),
  answers jsonb not null default '{}'::jsonb
    check (jsonb_typeof(answers) = 'object'),
  updated_by uuid references auth.users(id) on delete set null,
  assigned_at timestamptz,
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (assessment_id, module_id),
  constraint m360_assessment_modules_assessment_company_fkey
    foreign key (assessment_id, company_id)
    references public.m360_assessments(id, company_id)
    on delete cascade
);

create index if not exists m360_assessment_modules_company_user_idx
  on public.m360_assessment_modules(company_id, assigned_user_id);

create index if not exists m360_assessment_modules_company_status_idx
  on public.m360_assessment_modules(company_id, status);

alter table public.m360_assessments enable row level security;
alter table public.m360_assessment_modules enable row level security;

-- O acesso será feito exclusivamente pelas Cloudflare Functions,
-- após validar sessão, empresa, papel e atribuição do módulo.
-- Não liberar acesso direto via Data API aos clientes.
revoke all on public.m360_assessments from public, anon, authenticated;
revoke all on public.m360_assessment_modules from public, anon, authenticated;

grant select, insert, update, delete
  on public.m360_assessments to service_role;
grant select, insert, update, delete
  on public.m360_assessment_modules to service_role;

comment on table public.m360_assessments is
  'Avaliações pertencentes a uma empresa. Dados compartilhados ficam em shared_payload; respostas ficam separadas por módulo.';
comment on column public.m360_assessments.legacy_invitation_id is
  'Vínculo opcional com uma avaliação pública antiga, somente após associação manual validada.';
comment on column public.m360_assessments.shared_payload is
  'Metadados compartilhados da avaliação, sem a chave answers.';
comment on table public.m360_assessment_modules is
  'Respostas e atribuição de cada módulo de uma avaliação empresarial. A autorização é validada no backend antes de cada leitura ou gravação.';

commit;
