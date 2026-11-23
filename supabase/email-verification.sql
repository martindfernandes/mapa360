-- DEPRECATED (22/11/2026): confirmação customizada descontinuada.
-- Não aplicar em novos ambientes. O produto utiliza confirmação nativa do Supabase Auth.
-- Objetos já existentes no DEV permanecem inativos e não são removidos por este arquivo.
begin;
create table if not exists public.m360_email_verifications (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null check (char_length(email) between 3 and 254),
  token_hash text not null unique check (length(token_hash) = 64),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  consumed_at timestamptz
);
create table if not exists public.m360_email_status (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null check (char_length(email) between 3 and 254),
  verified_at timestamptz not null,
  updated_at timestamptz not null default now()
);
create index if not exists m360_email_verifications_expiry_idx on public.m360_email_verifications(expires_at);
alter table public.m360_email_verifications enable row level security;
alter table public.m360_email_status enable row level security;
revoke all on public.m360_email_verifications from public, anon, authenticated;
revoke all on public.m360_email_status from public, anon, authenticated;
grant select, insert, update, delete on public.m360_email_verifications to service_role;
grant select, insert, update, delete on public.m360_email_status to service_role;
create or replace function public.consume_m360_email_verification(p_token_hash text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_record public.m360_email_verifications%rowtype; v_current_email text;
begin
  if p_token_hash is null or length(p_token_hash) <> 64 then raise exception 'invalid_or_expired_token' using errcode = 'P0001'; end if;
  select * into v_record from public.m360_email_verifications where token_hash = p_token_hash for update;
  if not found or v_record.consumed_at is not null or v_record.expires_at <= now() then raise exception 'invalid_or_expired_token' using errcode = 'P0001'; end if;
  select email into v_current_email from auth.users where id = v_record.user_id;
  if v_current_email is null or lower(v_current_email) <> lower(v_record.email) then raise exception 'email_changed' using errcode = 'P0001'; end if;
  update public.m360_email_verifications set consumed_at = now() where user_id = v_record.user_id;
  insert into public.m360_email_status(user_id,email,verified_at,updated_at)
  values(v_record.user_id,lower(v_record.email),now(),now())
  on conflict(user_id) do update set email=excluded.email,verified_at=excluded.verified_at,updated_at=now();
  return jsonb_build_object('ok',true);
end; $$;
revoke all on function public.consume_m360_email_verification(text) from public, anon, authenticated;
grant execute on function public.consume_m360_email_verification(text) to service_role;
commit;
