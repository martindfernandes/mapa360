-- Mapa 360 · linhagem e cópia de avaliações
-- Destino exclusivo: projeto Supabase mapa360-dev.
-- Migração aditiva; não altera avaliações existentes.

begin;

alter table public.m360_assessments
  add column if not exists source_assessment_id uuid;

alter table public.m360_assessments
  drop constraint if exists m360_assessments_source_assessment_company_fkey;

alter table public.m360_assessments
  add constraint m360_assessments_source_assessment_company_fkey
  foreign key (source_assessment_id, company_id)
  references public.m360_assessments(id, company_id)
  on delete restrict;

create index if not exists m360_assessments_source_idx
  on public.m360_assessments(company_id, source_assessment_id)
  where source_assessment_id is not null;

create index if not exists m360_assessments_source_fk_idx
  on public.m360_assessments(source_assessment_id, company_id)
  where source_assessment_id is not null;

comment on column public.m360_assessments.source_assessment_id is
  'Avaliação de origem quando esta avaliação foi criada por cópia.';

alter table public.m360_assessment_events
  drop constraint if exists m360_assessment_events_event_type_check;

alter table public.m360_assessment_events
  add constraint m360_assessment_events_event_type_check
  check (event_type = any (array[
    'title_updated', 'modules_added', 'module_removed',
    'module_reassigned', 'assessment_copied'
  ]));

create or replace function public.clone_m360_company_assessment(
  p_source_assessment_id uuid,
  p_company_id uuid,
  p_actor_user_id uuid,
  p_title text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_new_id uuid;
  v_source_title text;
begin
  if p_title is null or char_length(btrim(p_title)) < 2 or char_length(btrim(p_title)) > 180 then
    raise exception 'Título inválido para a cópia.';
  end if;

  select title into v_source_title
  from public.m360_assessments
  where id = p_source_assessment_id and company_id = p_company_id;

  if not found then
    raise exception 'Avaliação de origem não encontrada nesta empresa.';
  end if;

  insert into public.m360_assessments (
    company_id, source_assessment_id, title, status, schema_version,
    shared_payload, created_by, updated_by
  )
  select
    a.company_id, a.id, btrim(p_title), 'draft', a.schema_version,
    jsonb_set(coalesce(a.shared_payload, '{}'::jsonb), '{stage}', '"triagem"'::jsonb, true),
    p_actor_user_id, p_actor_user_id
  from public.m360_assessments a
  where a.id = p_source_assessment_id and a.company_id = p_company_id
  returning id into v_new_id;

  insert into public.m360_assessment_modules (
    assessment_id, company_id, module_id, assigned_user_id,
    status, answers, updated_by, assigned_at, completed_at
  )
  select
    v_new_id, m.company_id, m.module_id,
    case when exists (
      select 1 from public.m360_company_members cm
      where cm.company_id = p_company_id and cm.user_id = m.assigned_user_id
        and cm.status = 'active'
    ) then m.assigned_user_id else null end,
    'pending', coalesce(m.answers, '{}'::jsonb), p_actor_user_id,
    case when exists (
      select 1 from public.m360_company_members cm
      where cm.company_id = p_company_id and cm.user_id = m.assigned_user_id
        and cm.status = 'active'
    ) then now() else null end,
    null
  from public.m360_assessment_modules m
  where m.assessment_id = p_source_assessment_id and m.company_id = p_company_id;

  insert into public.m360_assessment_events (
    company_id, assessment_id, actor_user_id, event_type, details
  ) values (
    p_company_id, v_new_id, p_actor_user_id, 'assessment_copied',
    jsonb_build_object(
      'source_assessment_id', p_source_assessment_id,
      'source_title', v_source_title,
      'copied_title', btrim(p_title),
      'answers_copied_as_unvalidated', true
    )
  );

  return v_new_id;
end;
$$;

revoke all on function public.clone_m360_company_assessment(uuid, uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.clone_m360_company_assessment(uuid, uuid, uuid, text)
  to service_role;

commit;
