import { supabase, json } from './_shared.js';

// Diagnóstico temporário e somente leitura para validar o banco isolado
// da branch de contas. Remover após a validação do Preview.
export async function onRequest({ request, env }) {
  if (request.method !== 'GET') {
    return json(405, { ok: false, error: 'Método não permitido' });
  }

  if (env.CF_PAGES_BRANCH !== 'feature/1.2.0-contas-usuarios') {
    return json(404, { ok: false });
  }

  try {
    const client = supabase(env);
    const checks = [
      ['m360_invitations', 'id'],
      ['m360_submissions', 'id'],
      ['m360_drafts', 'invitation_id'],
      ['m360_rate_limits', 'bucket_key']
    ];

    const tables = {};
    for (const [table, column] of checks) {
      const { error } = await client
        .from(table)
        .select(column, { head: true })
        .limit(0);
      tables[table] = !error;
    }

    const ok = Object.values(tables).every(Boolean);
    return json(ok ? 200 : 503, {
      ok,
      environment: 'preview-development',
      connection: 'configured',
      tables
    });
  } catch {
    return json(503, {
      ok: false,
      environment: 'preview-development',
      connection: 'failed'
    });
  }
}
