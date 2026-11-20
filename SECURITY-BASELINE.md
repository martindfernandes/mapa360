# Baseline de Segurança — Mapeamento 360

Este documento separa controles implementados no código, controles que dependem da configuração da plataforma e controles ainda pendentes. Não representa certificação nem garantia de segurança absoluta.

## 1. Modelo de ameaças

| Ameaça | Impacto | Controles |
|---|---|---|
| DDoS de rede e HTTP flood | Indisponibilidade | Mitigação DDoS automática da Cloudflare; regras WAF/rate limiting no domínio |
| Abuso de API e bots | Sessões falsas, consumo de recursos | Rate limiting por rota; Turnstile com validação server-side |
| Força bruta / credential stuffing | Tomada do painel | Cloudflare Access ou identidade forte; limites de tentativas; rotação de credenciais |
| XSS | Roubo de sessão e execução de código | CSP, escape contextual, evitar HTML dinâmico não confiável |
| CSRF | Ações feitas em nome de usuário autenticado | Validação estrita de Origin e Fetch Metadata em rotas POST |
| SQL injection | Leitura ou alteração indevida do banco | Supabase client com consultas parametrizadas; nunca concatenar SQL |
| IDOR / acesso entre empresas | Exposição de avaliações | Token aleatório por avaliação, hash no banco e validação no servidor |
| Exposição de segredos | Uso indevido de Supabase/Resend/admin | Secrets apenas no Cloudflare; nunca publicar valores no frontend ou repositório |
| Exfiltração e vazamento | Perda de confidencialidade | RLS, menor privilégio, controle administrativo e política de retenção |
| Supply-chain | Dependência comprometida | Dependências fixadas/atualizadas, revisão de mudanças e alertas de vulnerabilidade |
| Erro humano / exclusão | Perda de dados | Backup e teste periódico de restauração |

## 2. Controles implementados na branch 1.1.2

- Segredos de Supabase, Resend e administração permanecem no backend.
- Tabelas do Supabase usam RLS e não concedem acesso direto a anon/authenticated; o backend usa credencial privilegiada.
- Tokens de sessão são aleatórios, têm 256 bits e somente o hash SHA-256 é armazenado no banco.
- Rotas de gravação validam método, origem e formato do token.
- JSON é validado e tem limite de tamanho por endpoint.
- Avaliações concluídas não aceitam novo envio.
- Cabeçalhos HTTP: CSP, HSTS em HTTPS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy, COOP e CORP.
- Respostas de API usam Cache-Control no-store.
- O painel não grava o token administrativo no localStorage; o token permanece em memória durante a sessão da página.

## 3. Controles externos obrigatórios antes da divulgação pública

### Cloudflare — WAF / Rate Limiting
Criar regras de limite para:
- `/api/start-public-assessment`: 5 requisições por IP a cada 10 minutos.
- `/api/assessment-progress`: 60 requisições por IP a cada 1 minuto.
- `/api/assessment-submit`: 10 requisições por IP a cada 10 minutos.
- `/api/create-invitation`: 10 requisições por IP a cada 10 minutos, além de proteção do painel.

Ajustar limites com base no tráfego real. Em redes corporativas e móveis, muitos usuários podem compartilhar o mesmo IP; evitar limites agressivos que bloqueiem usuários legítimos.

**Importante:** as regras WAF da zona aplicam-se quando o tráfego passa por um domínio personalizado proxied na zona Cloudflare. O hostname `mapa360.pages.dev` é gerenciado pela Cloudflare Pages; para aplicar regras WAF próprias da zona, usar um domínio/subdomínio personalizado conectado ao projeto Pages e proxied. A proteção DDoS gerenciada pela Cloudflare para Pages continua sendo uma camada distinta.

### Cloudflare Turnstile
Adicionar desafio anti-bot ao início de avaliação pública e validar o token obrigatoriamente no servidor com Siteverify. Nunca confiar apenas no widget do navegador. Criar chaves separadas para Preview e Production e restringir os hostnames.

### Administração
Proteger `/admin.html` e `/api/admin-evaluations` / `/api/create-invitation` com Cloudflare Access ou autenticação individual forte. O token administrativo compartilhado atual é um controle provisório; não é autenticação multiusuário ideal.

### Supabase
- Confirmar RLS habilitado em todas as tabelas.
- Confirmar ausência de políticas públicas de leitura/escrita.
- Não expor a chave Secret/Service Role.
- Ativar MFA para contas administrativas do projeto.
- Configurar backups e testar restauração.
- Definir retenção e exclusão de avaliações conforme política de privacidade.

## 4. Testes de segurança antes de produção

- Requisições sem token, token inválido, expirado e já concluído.
- Origem externa e método HTTP não permitido.
- JSON malformado e payload acima do limite.
- Tentativa de ler avaliação de outra empresa usando token diferente.
- Tentativas repetidas contra início público e rotas administrativas.
- Verificação de que segredos não aparecem em arquivos públicos, bundles, logs ou respostas.
- Verificação de cabeçalhos de segurança no domínio de Preview.
- Teste funcional completo: iniciar, salvar, recarregar, retomar, concluir e conferir painel.
- Teste de restauração do backup.

## 5. Limites conhecidos

- Rate limiting e Turnstile não ficam ativos apenas por existir código no repositório; dependem de configuração e validação na Cloudflare.
- A mitigação DDoS gerenciada reduz ataques volumétricos, mas não substitui limites de API, autenticação, monitoramento e capacidade operacional.
- Não foi realizado pentest externo nem auditoria independente.
- A branch deve permanecer em Preview até todos os testes e configurações serem concluídos.
