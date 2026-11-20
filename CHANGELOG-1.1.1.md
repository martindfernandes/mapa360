# CHANGELOG — Mapeamento 360 Autoavaliação v1.1.1

## Compatibilidade com Cloudflare Pages
- Migradas as funções de backend do formato Netlify Functions para Cloudflare Pages Functions.
- Criadas rotas `/api/assessment-progress`, `/api/assessment-submit`, `/api/admin-evaluations` e `/api/create-invitation`.
- Atualizadas as chamadas do aplicativo e do painel administrativo para as novas rotas.
- Adaptado o acesso às variáveis de ambiente para `context.env` da Cloudflare.
- Removidas dependências de `process.env`, `Buffer` e `node:crypto` nas funções migradas.
- Documentada a configuração de variáveis e secrets para Cloudflare Pages.

## Base funcional
- Mantidas as alterações dos módulos opcionais da versão 1.1.0.
- Mantido o banco Supabase existente; nenhuma migração destrutiva foi incluída.

## Observações
- A validação de sintaxe foi realizada localmente.
- A implantação e os testes integrados com credenciais reais devem ser realizados no projeto Cloudflare do usuário.
