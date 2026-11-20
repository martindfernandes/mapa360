# Validação da versão 1.1.2 — Acesso público

## Implementado na branch
- Endpoint público de início de avaliação.
- Criação de sessão aleatória com hash armazenado no Supabase.
- Salvamento de rascunho e envio final vinculados à sessão.
- Armazenamento local do token para retomada no mesmo navegador.
- Compatibilidade mantida com links individuais existentes.
- Nenhuma alteração destrutiva no schema.

## Pendências antes da publicação
- Configurar Rate Limiting no Cloudflare para POST /api/start-public-assessment.
- Executar verificação de sintaxe e build.
- Testar criação da sessão, salvamento, retomada, envio final e painel administrativo com Supabase real.
- Testar também um convite individual já existente.
- Conferir a publicação em ambiente Preview antes de mesclar para main.

Esta versão não deve ser divulgada nem mesclada para produção até a conclusão dos testes acima.
