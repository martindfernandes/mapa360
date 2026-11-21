-- Controle transacional de frequência das APIs públicas do Mapeamento 360
-- Executar uma única vez no SQL Editor do Supabase após revisar este arquivo.
-- A tabela e a função ficam acessíveis somente ao backend (service_role).

create table if not exists public.m360_rate_limits (
  bucket_key text primary key
    check (length(bucket_key) = 64),
  window_started_at timestamptz not null,
  request_count integer not null check (request_count >= 1),
  updated_at timestamptz not null default now()
);

create index if not exists m360_rate_limits_updated_at_idx
  on public.m360_rate_limits (updated_at);

alter table public.m360_rate_limits enable row level security;

revoke all on table public.m360_rate_limits from public;
revoke all on table public.m360_rate_limits from anon, authenticated;

create or replace function public.consume_m360_rate_limit(
  p_bucket_key text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
  v_window_started_at timestamptz;
  v_now timestamptz := now();
begin
  if p_bucket_key is null
     or length(p_bucket_key) <> 64
     or p_limit < 1 or p_limit > 1000
     or p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'Parâmetros de limite inválidos';
  end if;

  insert into public.m360_rate_limits (
    bucket_key, window_started_at, request_count, updated_at
  ) values (
    p_bucket_key, v_now, 1, v_now
  )
  on conflict (bucket_key) do update
    set request_count = case
          when public.m360_rate_limits.window_started_at
               + make_interval(secs => p_window_seconds) <= v_now
            then 1
          else public.m360_rate_limits.request_count + 1
        end,
        window_started_at = case
          when public.m360_rate_limits.window_started_at
               + make_interval(secs => p_window_seconds) <= v_now
            then v_now
          else public.m360_rate_limits.window_started_at
        end,
        updated_at = v_now
  returning request_count, window_started_at
    into v_count, v_window_started_at;

  -- Limpeza oportunista e limitada a registros antigos.
  delete from public.m360_rate_limits
   where updated_at < v_now - interval '7 days';

  return v_count <= p_limit;
end;
$$;

revoke all on function public.consume_m360_rate_limit(text, integer, integer) from public;
revoke all on function public.consume_m360_rate_limit(text, integer, integer) from anon, authenticated;
grant execute on function public.consume_m360_rate_limit(text, integer, integer) to service_role;
