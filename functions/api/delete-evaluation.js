import { supabase, json, parse, admin, sameOrigin } from './_shared.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return json(405, { error: 'Método não permitido' });
  if (!sameOrigin(request)) return json(403, { error: 'Origem não autorizada' });
  if (!admin(request, env)) return json(401, { error: 'Acesso não autorizado' });

  try {
    const { id } = await parse(request, 2048);
    if (typeof id !== 'string' || !UUID.test(id)) {
      return json(400, { error: 'Identificador de avaliação inválido' });
    }

    const client = supabase(env);
    // As chaves estrangeiras de submissions e drafts usam ON DELETE CASCADE.
    // Assim, a remoção do convite apaga os registros relacionados atomicamente.
    const { data, error } = await client.from('m360_invitations')
      .delete()
      .eq('id', id)
      .select('id')
      .maybeSingle();

    if (error) return json(500, { error: 'Não foi possível excluir a avaliação' });
    if (!data) return json(404, { error: 'A avaliação não foi encontrada ou já foi excluída' });

    return json(200, { success: true });
  } catch (error) {
    const status = Number(error?.status);
    if ([400, 413, 415].includes(status)) return json(status, { error: error.message });
    return json(500, { error: 'Falha interna ao excluir avaliação' });
  }
}
