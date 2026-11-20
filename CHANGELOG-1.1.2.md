# CHANGELOG — Mapeamento 360 Autoavaliação v1.1.2

## Acesso público por link único
- A avaliação pode ser iniciada pela URL pública principal, sem token de convite na URL.
- Ao avançar da etapa Contexto, o backend cria uma sessão interna com token aleatório vinculado à empresa informada.
- A sessão é armazenada no navegador para permitir retomada após recarregar ou fechar a página.
- Salvamento automático de rascunho e envio final usam a sessão interna no Supabase.
- O nome da empresa informado no contexto é sincronizado com o registro da avaliação.
- Convites individuais continuam disponíveis como opção administrativa.

## Compatibilidade e segurança
- Mantidas as tabelas existentes; não há migração destrutiva nem alteração obrigatória no schema.
- Mantida a autenticação administrativa existente.
- Sessões públicas expiram em 90 dias.
- A divulgação ampla depende da configuração de Rate Limiting no Cloudflare para `POST /api/start-public-assessment`.

## Validação
- Implementação preparada em branch isolada; não publicada em produção.
- Testes integrados com Cloudflare e Supabase ainda precisam ser executados antes da mesclagem.
