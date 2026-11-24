-- Correção da contagem de chaves JSONB na RPC de salvamento de módulos.
-- Aplicar somente no Supabase DEV da branch feature/1.2.0-contas-usuarios.
-- A definição existente é preservada; apenas a função inexistente jsonb_object_length
-- é substituída por uma contagem compatível via jsonb_object_keys.

DO $migration$
DECLARE
  v_definition text;
BEGIN
  SELECT pg_get_functiondef(
    'public.save_m360_company_assessment_module(uuid,uuid,uuid,text,timestamp with time zone,jsonb,text)'::regprocedure
  ) INTO v_definition;

  IF position('jsonb_object_length(p_answers)' IN v_definition) = 0 THEN
    RAISE EXCEPTION 'A função não contém o trecho esperado; migração cancelada sem alterações.';
  END IF;

  v_definition := replace(
    v_definition,
    'jsonb_object_length(p_answers)',
    '(SELECT count(*) FROM jsonb_object_keys(p_answers))'
  );

  EXECUTE v_definition;
END
$migration$;

REVOKE ALL ON FUNCTION public.save_m360_company_assessment_module(uuid,uuid,uuid,text,timestamp with time zone,jsonb,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_m360_company_assessment_module(uuid,uuid,uuid,text,timestamp with time zone,jsonb,text)
  TO service_role;
