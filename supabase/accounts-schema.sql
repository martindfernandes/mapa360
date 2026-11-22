-- Mapeamento 360 · contas e empresas · migração inicial
-- Aplicar somente no projeto Supabase mapa360-dev.
-- Esta migração NÃO associa avaliações antigas a empresas automaticamente.
-- Registros existentes em m360_invitations permanecem com company_id NULL.

begin;

create table if not exists public.m360_companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 180),
  normalized_name text not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint m360_companies_normalized_name_key unique (normalized_name),
  constraint m360_companies_normalized_name_matches_name
    check (normalized_name = lower(btrim(name)))
);

create table if not exists public.m360_company_members (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.m360_companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member')),
  invited_by uuid references auth.users(id) on delete set null,
  joined_at timestamptz not null default now(),
  constraint m360_company_members_company_user_key unique (company_id, user_id)
);

create index if not exists m360_company_members_user_idx
  on public.m360_company_members(user_id);
create index if not exists m360_company_members_company_idx
  on public.m360_company_members(company_id);

create table if not exists public.m360_company_invitations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.m360_companies(id) on delete cascade,
  email text not null check (char_length(btrim(email)) between 3 and 254),
  role text not null default 'member' check (role in ('admin', 'member')),
  token_hash text not null unique,
  invited_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id) on delete set null
);

create index if not exists m360_company_invitations_company_idx
  on public.m360_company_invitations(company_id);
create unique index if not exists m360_company_invitations_pending_email_key
  on public.m360_company_invitations(company_id, lower(email))
  where accepted_at is null;

alter table public.m360_invitations
  add column if not exists company_id uuid references public.m360_companies(id) on delete set null;
alter table public.m360_invitations
  add column if not exists created_by_user_id uuid references auth.users(id) on delete set null;

create index if not exists m360_invitations_company_idx
  on public.m360_invitations(company_id);

alter table public.m360_companies enable row level security;
alter table public.m360_company_members enable row level security;
alter table public.m360_company_invitations enable row level security;

revoke all on public.m360_companies from public, anon, authenticated;
revoke all on public.m360_company_members from public, anon, authenticated;
revoke all on public.m360_company_invitations from public, anon, authenticated;

grant select, insert, update, delete on public.m360_companies to service_role;
grant select, insert, update, delete on public.m360_company_members to service_role;
grant select, insert, update, delete on public.m360_company_invitations to service_role;

comment on table public.m360_companies is
  'Empresas cadastradas no Mapeamento 360. A primeira conta que cria a empresa recebe papel de administradora.';
comment on table public.m360_company_members is
  'Vínculo entre usuários autenticados e empresas; acesso sempre validado no servidor.';
comment on table public.m360_company_invitations is
  'Convites individuais para usuários ingressarem em uma empresa já cadastrada.';
comment on column public.m360_invitations.company_id is
  'Empresa proprietária da avaliação. NULL em registros legados até validação explícita; nunca preencher apenas pelo nome.';

commit;
