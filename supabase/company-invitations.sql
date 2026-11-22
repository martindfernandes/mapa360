-- Mapeamento 360 · aceite seguro de convites de empresa
-- Aplicar somente no projeto Supabase mapa360-dev.

begin;

create or replace function public.accept_m360_company_invitation(
  p_token_hash text,
  p_user_id uuid,
  p_email text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invitation public.m360_company_invitations%rowtype;
  v_auth_email text;
begin
  if p_token_hash is null or p_user_id is null or p_email is null then
    raise exception 'invalid_invitation' using errcode = '22023';
  end if;

  select email into v_auth_email
  from auth.users
  where id = p_user_id and email_confirmed_at is not null;

  if v_auth_email is null or lower(v_auth_email) <> lower(btrim(p_email)) then
    raise exception 'email_not_verified' using errcode = 'P0001';
  end if;

  select * into v_invitation
  from public.m360_company_invitations
  where token_hash = p_token_hash
  for update;

  if not found or v_invitation.accepted_at is not null or v_invitation.expires_at <= now() then
    raise exception 'invitation_invalid_or_expired' using errcode = 'P0001';
  end if;

  if lower(v_invitation.email) <> lower(v_auth_email) then
    raise exception 'invitation_email_mismatch' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_invitation.company_id::text, 1));

  if exists (select 1 from public.m360_company_members where user_id = p_user_id) then
    raise exception 'user_already_has_company' using errcode = '23505';
  end if;

  insert into public.m360_company_members
    (company_id, user_id, role, status, invited_by)
  values
    (v_invitation.company_id, p_user_id, 'member', 'active', v_invitation.invited_by);

  update public.m360_company_invitations
  set accepted_at = now(), accepted_by = p_user_id
  where id = v_invitation.id;

  return jsonb_build_object('ok', true, 'company_id', v_invitation.company_id);
end;
$$;

revoke all on function public.accept_m360_company_invitation(text, uuid, text) from public;
revoke all on function public.accept_m360_company_invitation(text, uuid, text) from anon, authenticated;
grant execute on function public.accept_m360_company_invitation(text, uuid, text) to service_role;

commit;
