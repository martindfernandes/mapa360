-- Mapeamento 360 · funções seguras de contas, empresas e administração
-- Aplicar somente no projeto Supabase mapa360-dev.
-- Todas as funções abaixo são chamadas exclusivamente pelo backend com service_role.

-- Cada usuário pertence a no máximo uma empresa.
create unique index if not exists m360_company_members_user_unique
  on public.m360_company_members(user_id);

-- Estado de acesso do vínculo. Bloqueio também será aplicado ao login via Supabase Auth.
alter table public.m360_company_members
  add column if not exists status text not null default 'active';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'm360_company_members_status_check'
      and conrelid = 'public.m360_company_members'::regclass
  ) then
    alter table public.m360_company_members
      add constraint m360_company_members_status_check
      check (status in ('active', 'blocked'));
  end if;
end;
$$;

-- Criação atômica da empresa e do primeiro administrador.
create or replace function public.create_m360_company(
  p_name text,
  p_user_id uuid
)
returns table (
  company_id uuid,
  company_name text,
  member_role text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_company_id uuid;
begin
  v_name := regexp_replace(btrim(coalesce(p_name, '')), '\\s+', ' ', 'g');

  if char_length(v_name) < 2 or char_length(v_name) > 180 then
    raise exception 'invalid_company_name' using errcode = '22023';
  end if;

  if p_user_id is null or not exists (
    select 1 from auth.users where id = p_user_id
  ) then
    raise exception 'invalid_user' using errcode = '22023';
  end if;

  if exists (select 1 from public.m360_company_members where user_id = p_user_id) then
    raise exception 'user_already_has_company' using errcode = 'P0001';
  end if;

  insert into public.m360_companies (name, normalized_name, created_by)
  values (v_name, lower(v_name), p_user_id)
  returning id into v_company_id;

  insert into public.m360_company_members (company_id, user_id, role, status)
  values (v_company_id, p_user_id, 'admin', 'active');

  return query select v_company_id, v_name, 'admin'::text;
end;
$$;

-- Ações administrativas sobre um vínculo. Transferência define o usuário escolhido
-- como único administrador da empresa, rebaixando os demais administradores a membros.
-- Remover significa retirar o vínculo com a empresa; a conta Auth e o histórico são preservados.
create or replace function public.manage_m360_company_member(
  p_company_id uuid,
  p_user_id uuid,
  p_action text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member public.m360_company_members%rowtype;
  v_active_admins integer;
begin
  if p_company_id is null or p_user_id is null then
    raise exception 'invalid_member' using errcode = '22023';
  end if;

  select * into v_member
  from public.m360_company_members
  where company_id = p_company_id and user_id = p_user_id
  for update;

  if not found then
    raise exception 'member_not_found' using errcode = 'P0002';
  end if;

  select count(*) into v_active_admins
  from public.m360_company_members
  where company_id = p_company_id and role = 'admin' and status = 'active';

  if p_action = 'promote' then
    if v_member.status <> 'active' then
      raise exception 'member_blocked' using errcode = 'P0001';
    end if;
    update public.m360_company_members set role = 'admin'
    where company_id = p_company_id and user_id = p_user_id;

  elsif p_action = 'demote' then
    if v_member.role = 'admin' and v_member.status = 'active' and v_active_admins <= 1 then
      raise exception 'last_active_admin' using errcode = 'P0001';
    end if;
    update public.m360_company_members set role = 'member'
    where company_id = p_company_id and user_id = p_user_id;

  elsif p_action = 'transfer' then
    if v_member.status <> 'active' then
      raise exception 'member_blocked' using errcode = 'P0001';
    end if;
    update public.m360_company_members
      set role = 'member'
      where company_id = p_company_id and role = 'admin';
    update public.m360_company_members
      set role = 'admin'
      where company_id = p_company_id and user_id = p_user_id;

  elsif p_action = 'remove' then
    if v_member.role = 'admin' and v_member.status = 'active' and v_active_admins <= 1 then
      raise exception 'last_active_admin' using errcode = 'P0001';
    end if;
    delete from public.m360_company_members
    where company_id = p_company_id and user_id = p_user_id;

  elsif p_action = 'block' then
    if v_member.status = 'active' and v_member.role = 'admin' and v_active_admins <= 1 then
      raise exception 'last_active_admin' using errcode = 'P0001';
    end if;
    update public.m360_company_members set status = 'blocked'
    where company_id = p_company_id and user_id = p_user_id;

  elsif p_action = 'unblock' then
    update public.m360_company_members set status = 'active'
    where company_id = p_company_id and user_id = p_user_id;

  else
    raise exception 'invalid_action' using errcode = '22023';
  end if;

  return jsonb_build_object('ok', true, 'action', p_action);
end;
$$;

revoke all on function public.create_m360_company(text, uuid) from public;
revoke all on function public.create_m360_company(text, uuid) from anon, authenticated;
grant execute on function public.create_m360_company(text, uuid) to service_role;

revoke all on function public.manage_m360_company_member(uuid, uuid, text) from public;
revoke all on function public.manage_m360_company_member(uuid, uuid, text) from anon, authenticated;
grant execute on function public.manage_m360_company_member(uuid, uuid, text) to service_role;
