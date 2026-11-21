# Implantação — Cloudflare Pages + Supabase + Resend

## Estrutura
- Site estático publicado pela Cloudflare Pages.
- Funções de servidor em `functions/api/`, com rotas `/api/*`.
- Supabase usado pelo backend com chave de serviço mantida somente como variável secreta da Cloudflare.
- Resend usado pelo backend para envio de convites e notificações.

## Cloudflare Pages
1. Conectar o repositório GitHub ao projeto Pages.
2. Root directory: diretório que contém `index.html`, `package.json` e `functions/` (normalmente `/`).
3. Framework preset: `None`.
4. Build command: deixar vazio para este projeto estático; manter `package.json` na raiz do projeto para resolução da dependência usada pelas Pages Functions.
5. Build output directory: `.` (raiz do projeto).
6. Confirmar que a pasta `functions/` está no mesmo nível de `index.html`.

## Variáveis de ambiente da Cloudflare Pages
Configurar para Production (e Preview apenas se desejar testar em preview):

### Secrets (marcar como Secret)
- `SUPABASE_SECRET_KEY` — chave Secret do Supabase (recomendada). Alternativamente, `SUPABASE_SERVICE_ROLE_KEY` se estiver usando a chave legada service_role. Nunca colocar no HTML, JavaScript público ou GitHub.
- `ADMIN_API_TOKEN` — token aleatório forte para o painel administrativo.
- `RESEND_API_KEY` — chave da API Resend.

### Text variables
- `SUPABASE_URL` — Project URL do Supabase.
- `PUBLIC_SITE_URL` — URL pública do site, por exemplo `https://mapa360.pages.dev`.
- `EMAIL_FROM` — remetente autorizado no Resend, por exemplo `Mapeamento 360 <avaliacoes@seudominio.com>`.
- `NOTIFICATION_EMAIL` — endereço que recebe aviso de avaliação concluída.

A variável `SUPABASE_ANON_KEY`/Publishable key não é usada pelas funções de servidor desta versão. A chave Secret é apropriada aqui porque fica exclusivamente no backend Cloudflare; nunca deve ser exposta no navegador.

## Supabase
1. Usar o projeto e as tabelas existentes; não recriar nem apagar dados.
2. Conferir se `supabase/schema.sql` já foi aplicado. Não executar novamente sem revisar, pois o banco pode já conter dados.
3. Conferir políticas RLS e permissões conforme o schema e os endpoints.

## Resend
1. Verificar o domínio/remetente no Resend.
2. Configurar `RESEND_API_KEY` e `EMAIL_FROM` na Cloudflare.
3. Testar primeiro com um destinatário controlado.

## Acesso público por link único (v1.1.2)
- O link público é a URL principal do site, sem `?token=`.
- A pessoa informa o nome da empresa na etapa Contexto e, ao avançar, o backend cria uma sessão interna com token aleatório.
- O token é guardado no armazenamento local do navegador; não é necessário convite individual.
- Convites individuais criados no painel continuam funcionando.
- A sessão pública expira em 90 dias. Cada nova avaliação cria um registro próprio, associado ao nome informado.
- Não é necessária alteração no schema atual: as sessões usam `m360_invitations`, e rascunhos/conclusões continuam nas tabelas existentes.

### Proteção contra abuso — obrigatória antes de divulgar o link
Criar uma regra de Rate Limiting no Cloudflare para:
- URI: `/api/start-public-assessment`
- Método: `POST`
- Limite inicial sugerido: 5 solicitações por IP em 10 minutos.
- Ação: bloquear temporariamente ou aplicar desafio, conforme opções disponíveis na conta.
Ajustar o limite após observar uso legítimo. O endpoint também valida origem, método e tamanho básico da solicitação, mas essas verificações não substituem o rate limiting.

## Testes obrigatórios antes de uso comercial
- `GET /api/admin-evaluations` sem token deve retornar 401.
- Criar convite pelo painel administrativo.
- Confirmar geração de link e recebimento do e-mail.
- Abrir convite e testar salvamento automático do rascunho.
- Concluir avaliação e confirmar persistência no Supabase.
- Reabrir o painel e conferir status.
- Testar expiração do convite e bloqueio de avaliação concluída.
- Testar os módulos opcionais e a preservação das respostas ao ativar/desativar módulos.

## Segurança pendente de endurecimento
Antes de disponibilizar amplamente: implementar rate limiting nos endpoints públicos, autenticação administrativa mais robusta que token compartilhado, trilha de auditoria, política de backup e política de retenção/exclusão de dados.
