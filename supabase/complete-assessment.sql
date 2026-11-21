-- Conclusão atômica de avaliação Mapeamento 360
-- Executar uma única vez no SQL Editor do Supabase após revisar este arquivo.
-- A função só pode ser executada por service_role.

create or replace function public.complete_m360_assessment(
  p_invitation_id uuid,
  p_payload jsonb,
  p_company_name text,
  p_submitted_at timestamptz
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_expires_at timestamptz;
  v_company_name text;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    return 'invalid_payload';
  end if;

  select status, expires_at, company_name
    into v_status, v_expires_at, v_company_name
    from public.m360_invitations
   where id = p_invitation_id
   for update;

  if not found then
    return 'not_found';
  end if;

  if v_expires_at < now() then
    return 'expired';
  end if;

  if v_status = 'concluída' then
    return 'already_completed';
  end if;

  insert into public.m360_submissions (
    invitation_id, payload, submitted_at
  ) values (
    p_invitation_id, p_payload, p_submitted_at
  );

  update public.m360_invitations
     set company_name = coalesce(nullif(left(trim(p_company_name), 180), ''), v_company_name),
         status = 'concluída',
         completed_at = p_submitted_at,
         last_activity_at = p_submitted_at
   where id = p_invitation_id;

  return 'completed';
end;
$$;

revoke all on function public.complete_m360_assessment(uuid, jsonb, text, timestamptz) from public;
revoke all on function public.complete_m360_assessment(uuid, jsonb, text, timestamptz) from anon, authenticated;
grant execute on function public.complete_m360_assessment(uuid, jsonb, text, timestamptz) to service_role;
