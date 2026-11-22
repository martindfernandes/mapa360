-- Mapeamento 360 · criação segura da primeira empresa e seu administrador
-- Aplicar somente no projeto Supabase mapa360-dev.
-- A chamada é feita pelo backend após validar a sessão do Supabase Auth.
-- A transação cria empresa + primeiro membro administrador de forma atômica.
-- Impede que uma conta seja vinculada a mais de uma empresa, inclusive em chamadas simultâneas.

create unique index if not exists m360_company_members_user_unique
  on public.m360_company_members(user_id);

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
  v_name := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');

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

  insert into public.m360_company_members (company_id, user_id, role)
  values (v_company_id, p_user_id, 'admin');

  return query
    select v_company_id, v_name, 'admin'::text;
end;
$$;

revoke all on function public.create_m360_company(text, uuid) from public;
revoke all on function public.create_m360_company(text, uuid) from anon, authenticated;
grant execute on function public.create_m360_company(text, uuid) to service_role;
