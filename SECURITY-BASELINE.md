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


## 6. Auditoria comparativa e consolidação (23/11/2026)

A revisão read-only desta rodada identificou que DEV e o banco antigo de produção são estruturalmente diferentes. DEV contém a arquitetura empresarial (empresas, membros, convites empresariais, avaliações, módulos e eventos), 9 usuários Auth e seis migrações registradas. O banco antigo contém somente as tabelas legadas de convites, submissões, rascunhos e rate limit, sem usuários Auth e sem migrações listadas. Não sincronizar bancos diretamente.

A estratégia a avaliar é um terceiro projeto Supabase consolidado, com baseline/migrações versionadas, carga controlada dos dados DEV e legados, mapeamento de IDs e reconciliação de duplicidades. Os dois bancos originais devem permanecer preservados até validação e aprovação da migração.

Achados confirmados no código DEV:
- Administração baseada em um único `ADMIN_API_TOKEN`; substituir por autenticação individual, MFA e RBAC.
- Endpoint de gravação de módulo valida objeto/status/atribuição/concorrência, mas ainda não valida integralmente as respostas contra schema canônico no servidor.
- A ação `save` não registra diff/histórico das respostas.
- As tabelas públicas usam RLS sem policies e grants revogados para clientes; o acesso é pelo backend service role. Manter essa arquitetura somente com auditoria rigorosa de todos os endpoints/RPCs privilegiados; não criar policies genéricas.
- Advisor DEV sinaliza proteção contra senhas vazadas desativada.
- As branches GitHub consultadas (DEV e main) estão sem proteção e sem checks obrigatórios.
- A allowlist Turnstile consultada não inclui o hostname atual do Preview `feature-1-2-0-conta-usuario.mapa360.pages.dev`.

Nenhum dado, schema ou configuração de produção foi alterado. Não foi possível alterar as configurações de proteção do GitHub, Auth do Supabase ou painel Cloudflare com as conexões disponíveis. Não houve pentest nem teste E2E em navegador.


Correção pontual aplicada na DEV: adicionada a allowlist do hostname atual do Preview `feature-1-2-0-conta-usuario.mapa360.pages.dev` em `functions/api/start-public-assessment.js`. O conteúdo foi relido após o commit e a presença do hostname foi confirmada. A validação real do Turnstile depende do teste no Preview com a chave/hostname configurados; não foi executada neste ambiente.


## 7. Correções de segurança aplicadas em DEV e produção (24/11/2026)

### DEV — branch `feature/1.2.0-contas-usuarios`
HEAD registrado nesta atualização: `b2b88f598c1280735e90197e72cefd33b6451f1c`.

Código:
- `functions/api/admin-manage-member.js`: passou a exigir validação de origem same-origin e limite de 10 operações por IP a cada 15 minutos; a validação do token administrativo permanece provisória.
- `functions/api/create-invitation.js`: limite de 5 convites por IP/15 min, validação de origem e escape contextual de conteúdo inserido no HTML do e-mail.
- `functions/api/company-assessment-module.js`: salvamento passou a chamar RPC transacional `save_m360_company_assessment_module`, sem atualização direta do módulo pelo endpoint.
- O endpoint valida estrutura de objeto, máximo de 500 chaves, nomes de chave e payload máximo de 500 KiB. A RPC repete limites, confirma vínculo ativo, empresa, avaliação aberta, atribuição do módulo e concorrência por `updated_at`.
- O salvamento e o evento `module_answers_saved` são gravados na mesma transação. O evento guarda ator, módulo, status anterior/novo, chaves alteradas e hashes SHA-256 dos payloads anterior/novo, sem duplicar o conteúdo integral das respostas no log.
- A constraint de `event_type` foi ampliada para aceitar `module_answers_saved`.
- O RPC novo tem `search_path = pg_catalog, public, pg_temp`; EXECUTE confirmado apenas para `service_role` e proprietário, negado para `anon` e `authenticated`.

Banco DEV:
- Migrações registradas: `harden_security_definer_search_path`, `allow_module_answer_audit_events`, `atomic_company_module_save_audit`, `correct_atomic_module_audit_status`, `preserve_module_status_on_save`, `add_hashes_to_module_audit`.
- As funções SECURITY DEFINER existentes tiveram `search_path` fixado para `pg_catalog, public, pg_temp` (exceto trigger interno `rls_auto_enable`, cujo caminho permanece `pg_catalog`).
- Consulta de privilégios confirmou que `anon` e `authenticated` não podem executar o RPC novo nem ler diretamente `m360_assessment_modules`; `service_role` pode executar o RPC.
- Não foram criadas policies RLS genéricas. O desenho continua sendo acesso por Cloudflare Functions/service role, com autorização explícita nos endpoints.

### Produção — branch `main` e banco legado
Código em `main`:
- `functions/api/_shared.js`: parser JSON estrito com limite de bytes, validação same-origin, formato de token de sessão, rate limit HMAC e escape HTML.
- `create-invitation.js`: same-origin, 5 convites/IP/15 min, validação de nome/e-mail e escape HTML.
- `assessment-progress.js`: same-origin, token de 43 caracteres, limite de 120 atualizações/15 min por token e payload máximo de 600 KiB.
- `assessment-submit.js`: same-origin, token de 43 caracteres, 5 envios/15 min por token, payload máximo de 1 MiB e conclusão via RPC transacional existente `complete_m360_assessment`.
- `admin-evaluations.js`: same-origin e 60 consultas/IP/15 min.
- A autenticação administrativa por `ADMIN_API_TOKEN` continua provisória; ainda não foi substituída por identidade individual/MFA.

Banco produção:
- Migração `harden_security_definer_search_path` aplicada.
- As duas funções SECURITY DEFINER legadas (`consume_m360_rate_limit` e `complete_m360_assessment`) agora usam `search_path = pg_catalog, public, pg_temp`.
- Seus ACLs continuam restritos a `service_role` e proprietário.

### Verificações executadas
- HEAD DEV e main relidos após os commits.
- Definição/ACL/search_path do RPC novo consultados no banco.
- Advisors de segurança reexecutados nos dois bancos.
- O alerta `RLS Enabled No Policy` permanece como INFO: as tabelas estão com RLS ligado e sem policies, mas os grants diretos a `anon`/`authenticated` estão ausentes no modelo consultado. Não adicionar policies sem redesenhar a autorização.
- O alerta `Leaked Password Protection Disabled` continua presente no DEV. A conexão atual não oferece operação de alteração das configurações Auth do projeto; não foi possível ligar essa opção pelo banco SQL.
- Uma tentativa de alterar default privileges do papel `supabase_admin` foi recusada por permissão insuficiente e não foi aplicada. A consulta atual não identificou grants diretos de tabelas públicas para `anon`/`authenticated`; rever defaults com o proprietário administrativo antes de novas tabelas criadas por esse papel.

### Pendências críticas
1. Substituir `ADMIN_API_TOKEN` compartilhado por autenticação individual, MFA e RBAC, em DEV e produção.
2. Validar respostas contra o catálogo canônico de perguntas/tipos/valores e obrigatoriedade antes de aceitar status `completed`. A validação estrutural atual não prova completude nem validade semântica.
3. Habilitar proteção contra senhas vazadas no Auth DEV e revisar/configurar política equivalente em produção.
4. Configurar proteção de branches, PRs e checks obrigatórios de CI no GitHub.
5. Rever Cloudflare WAF/rate limits/Turnstile/headers no painel e confirmar secrets/hostnames dos dois ambientes.
6. Executar testes E2E autenticados, isolamento multiempresa, bloqueio de sessões existentes, concorrência e ataques controlados. Nenhum teste de navegador ou pentest foi executado nesta rodada.
7. Confirmar que os commits em `main` foram publicados pelo pipeline Cloudflare; os commits foram gravados, mas o deploy não foi verificado.
