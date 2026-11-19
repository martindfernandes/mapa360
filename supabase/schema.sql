-- Mapeamento 360 Autoavaliação · esquema inicial
create extension if not exists pgcrypto;
create table if not exists public.m360_invitations (
 id uuid primary key default gen_random_uuid(), company_name text not null, contact_name text,
 contact_email text, token_hash text not null unique, status text not null default 'convite criado',
 created_at timestamptz not null default now(), last_activity_at timestamptz, completed_at timestamptz,
 expires_at timestamptz not null
);
create table if not exists public.m360_submissions (
 id uuid primary key default gen_random_uuid(), invitation_id uuid not null unique references public.m360_invitations(id) on delete cascade,
 payload jsonb not null, submitted_at timestamptz not null default now()
);
alter table public.m360_invitations enable row level security;
alter table public.m360_submissions enable row level security;
-- Sem políticas públicas: acesso somente pelas Netlify Functions usando SERVICE ROLE.
revoke all on public.m360_invitations from anon, authenticated;
revoke all on public.m360_submissions from anon, authenticated;

create table if not exists public.m360_drafts (
 invitation_id uuid primary key references public.m360_invitations(id) on delete cascade,
 payload jsonb not null, updated_at timestamptz not null default now()
);
alter table public.m360_drafts enable row level security;
revoke all on public.m360_drafts from anon, authenticated;
