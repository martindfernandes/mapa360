-- Mapa 360 · índices de chaves estrangeiras das avaliações empresariais
-- Destino exclusivo: Supabase mapa360-dev.
-- Migração aditiva; não altera registros nem permissões.

begin;

create index if not exists m360_assessment_modules_assessment_company_fk_idx
  on public.m360_assessment_modules (assessment_id, company_id);

create index if not exists m360_assessment_modules_assigned_user_fk_idx
  on public.m360_assessment_modules (assigned_user_id);

create index if not exists m360_assessment_modules_updated_by_fk_idx
  on public.m360_assessment_modules (updated_by);

create index if not exists m360_assessments_created_by_fk_idx
  on public.m360_assessments (created_by);

create index if not exists m360_assessments_updated_by_fk_idx
  on public.m360_assessments (updated_by);

commit;
