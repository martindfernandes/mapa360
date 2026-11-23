-- Mapa 360 · restrição de execução da função interna de RLS
-- A função é acionada pelo event trigger do PostgreSQL, não pela aplicação.
-- Remove a possibilidade de chamá-la como RPC pela Data API.

revoke execute on function public.rls_auto_enable()
  from public, anon, authenticated;
