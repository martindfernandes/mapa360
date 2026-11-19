# Checklist de implantação segura

1. Criar projeto Supabase e executar `supabase/schema.sql`.
2. No Netlify, conectar o repositório e configurar `npm install` como build command.
3. Definir `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_API_TOKEN`, `RESEND_API_KEY`, `EMAIL_FROM` e `NOTIFICATION_EMAIL`.
4. Configurar domínio e remetente verificado no provedor de e-mail.
5. Publicar e acessar `/admin.html`; inserir o token administrativo.
6. Gerar convite de teste para um endereço controlado. Validar expiração, envio, persistência e notificação.
7. Antes de usar com clientes: adicionar autenticação forte ao painel, rate limiting, trilha de auditoria, rotina de backup e política de retenção/exclusão.

**Atenção:** o token administrativo nesta primeira versão é uma credencial bearer de servidor. Não compartilhar, não reutilizar senhas e gerar valor aleatório com pelo menos 32 bytes.
