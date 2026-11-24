import { supabase, json, parse, platformAdmin, sameOrigin, consumeRateLimit } from './_shared.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return json(405, { error: 'Método não permitido' });
  if (!sameOrigin(request)) return json(403, { error: 'Origem não autorizada' });
  const platformAuth = await platformAdmin(request, env, { action: 'admin_evaluation_delete_attempted' });
    if (!platformAuth.ok) return json(platformAuth.status, { error: platformAuth.error, code: platformAuth.code });

  try {
    const { id, confirmation } = await parse(request, 4096);
    if (typeof id !== 'string' || !UUID.test(id)) {
      return json(400, { error: 'Identificador de avaliação inválido' });
    }
    if (typeof confirmation !== 'string' || !confirmation.trim()) {
      return json(400, { error: 'Confirmação obrigatória. Informe o nome exato da empresa.' });
    }

    const client = supabase(env);
    const ip = request.headers.get('cf-connecting-ip');
    if (!ip) return json(503, { error: 'Proteção temporariamente indisponível.' });
    if (!(await consumeRateLimit(env, client, 'platformAdmin-delete-evaluation', ip, 5, 900))) {
      return json(429, { error: 'Muitas solicitações administrativas. Aguarde e tente novamente.' });
    }

    const { data: evaluation, error: lookupError } = await client.from('m360_invitations')
      .select('id,company_name')
      .eq('id', id)
      .maybeSingle();

    if (lookupError) return json(500, { error: 'Não foi possível validar a avaliação' });
    if (!evaluation) return json(404, { error: 'A avaliação não foi encontrada ou já foi excluída' });

    // Segunda barreira: o servidor exige o nome armazenado no banco, não apenas
    // uma confirmação visual que poderia ser ignorada por uma chamada direta à API.
    if (confirmation !== evaluation.company_name) {
      return json(409, { error: 'O nome informado não corresponde exatamente ao nome da empresa. Nada foi excluído.' });
    }

    // As FKs de submissions e drafts usam ON DELETE CASCADE.
    // A exclusão do convite remove os registros vinculados no próprio banco.
    const { data, error } = await client.from('m360_invitations')
      .delete()
      .eq('id', id)
      .eq('company_name', evaluation.company_name)
      .select('id')
      .maybeSingle();

    if (error) return json(500, { error: 'Não foi possível excluir a avaliação' });
    if (!data) return json(409, { error: 'A avaliação mudou durante a operação. Atualize o painel e tente novamente.' });

    return json(200, { success: true });
  } catch (error) {
    const status = Number(error?.status);
    if ([400, 413, 415].includes(status)) return json(status, { error: error.message });
    return json(500, { error: 'Falha interna ao excluir avaliação' });
  }
}
