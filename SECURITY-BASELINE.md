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


Complemento da rodada (24/11/2026):
- No código de produção, a comparação do `ADMIN_API_TOKEN` passou a percorrer os caracteres em tempo constante após validar comprimento e formato Bearer. Isso reduz vazamento por diferenças de tempo, mas não substitui autenticação individual, MFA ou RBAC.
- HEAD main após essa alteração: `a8d146567ea8345d60f9f6535bbc5541b9b3f804`.


## Complemento — controles adicionais na DEV (24/11/2026)

HEAD DEV após esta etapa: `b3a19dc66197f7f0a9cdd91ad1cb3a95db68b5bc`.

### Código
- `company-assessment-module.js`: limites por usuário e IP para operações de leitura e gravação de módulos, além do RPC transacional com validação estrutural e de tipos, limite de payload, autorização de vínculo/atribuição e proteção de metadados de validação consultiva.
- `company-assessments.js`: limites por usuário e IP para consulta, criação, cópia e configuração de avaliações.
- `company-manage-member.js`: limites por usuário e IP na gestão de participantes.
- `company-assessment-members.js`: limites por usuário e IP na consulta de participantes.
- `admin-companies.js`, `admin-evaluations.js`, `admin-result.js` e `delete-evaluation.js`: validação de origem e limites por IP nas rotas administrativas legadas. A autenticação dessas rotas ainda usa o token compartilhado.
- `admin-manage-member.js` já exige same-origin e limita operações por IP.

### Banco DEV
- Migrações `validate_canonical_module_answers` e `tighten_answer_validation_and_completion` aplicadas.
- RPC de salvamento rejeita módulo inválido, identificadores fora dos padrões por módulo, campos desconhecidos, tipos/valores inválidos e tentativa de alteração indevida de metadados de validação consultiva por membro comum.
- Para módulos de catálogo fixo (geral, PPCP, automação, dados BI, administrativo e projetos), a transição para concluído exige as perguntas fixas respondidas com nível válido; "não sei informar" e "não se aplica" permanecem respostas válidas.
- A consulta de privilégios confirmou EXECUTE apenas para `service_role` entre os papéis de aplicação. Um teste SQL de entrada com módulo inválido foi executado; o retorno não mostrou erro de execução e a consulta de privilégios confirmou a restrição.

### Limites conhecidos — não considerar concluído
- Os identificadores de módulos dinâmicos (segmento e contexto industrial) ainda usam padrões de chave e não uma lista canônica derivada integralmente do contexto da avaliação. A completude desses módulos dinâmicos requer uma próxima etapa de modelagem do catálogo no servidor.
- A validação atual não é pentest e não substitui testes E2E com usuários de duas empresas.
- A autenticação do painel administrativo legado ainda depende de `ADMIN_API_TOKEN`. Não foi substituída por identidade individual/MFA porque ainda é necessário definir quais contas terão papel de administrador global da plataforma e como será a recuperação de acesso.
- O Auth ainda indica proteção contra senhas vazadas desativada no DEV; não foi possível alterar a configuração pelo conector.
- A conexão GitHub disponível permite leitura de regras de branch, mas não fornece ação para alterar proteção/rulesets. Cloudflare Dashboard também não está conectado.


## Complemento — preparação do Administrador Global na DEV (24/11/2026)

- A conta informada pelo responsável da plataforma foi localizada no Supabase DEV, com e-mail confirmado e correspondência única.
- Criado o schema não exposto `private` e as tabelas `private.m360_platform_roles` e `private.m360_platform_admin_audit`.
- Atribuído à conta identificada o papel `platform_admin`, ativo, separado dos papéis de administrador de empresa.
- As tabelas estão com RLS habilitado, sem políticas para `anon`/ `authenticated`; privilégios diretos desses papéis foram revogados. O uso previsto é exclusivamente pelo backend com `service_role`.
- A consulta de verificação confirmou a linha do papel e a conta correspondente. O Supabase Advisor informa RLS sem políticas para essas duas tabelas; isso é intencional nesta arquitetura de acesso exclusivamente server-side, mas deve ser reavaliado se o modelo de acesso mudar.
- **Ainda não habilita o painel:** a interface e as rotas administrativas continuam usando `ADMIN_API_TOKEN`. A migração para sessão Supabase individual, validação de papel no servidor, MFA/AAL2, auditoria efetiva das operações e remoção segura do token compartilhado ainda precisam ser implementadas e testadas.
- Nenhuma alteração foi feita na produção. Nenhuma senha, token ou chave foi consultada ou alterada.


## Complemento — autenticação individual do Administrador Global na DEV (24/11/2026)

Esta seção atualiza e substitui, para a branch DEV, a pendência anterior que dizia que o painel ainda dependia do token compartilhado.

### Banco de dados DEV
- Criadas as funções públicas is_m360_platform_admin(uuid) e audit_m360_platform_admin_action(uuid,text,uuid,jsonb), ambas SECURITY DEFINER com search_path fixo.
- EXECUTE revogado de PUBLIC, anon e authenticated; concedido apenas a service_role.
- A consulta de privilégio confirmou anon_exec=false, authenticated_exec=false e service_role_exec=true para as duas funções.
- Teste de consulta confirmou que a conta identificada possui platform_admin=true.
- As tabelas de papéis e auditoria permanecem no schema private, com RLS habilitado e sem acesso direto dos papéis de aplicação.

### Backend DEV
- Criado platformAdmin() em functions/api/_shared.js: valida o JWT consultando Supabase Auth (getUser), verifica o papel no banco por RPC, confere o nível AAL do JWT e exige aal2 nas operações administrativas.
- A auditoria é registrada por RPC antes da operação; se a gravação da auditoria falhar, a operação é bloqueada.
- Criado functions/api/admin-session.js para validar a identidade e o papel durante o primeiro acesso/configuração de MFA, sem liberar operações administrativas sem MFA.
- Migradas para autenticação individual e papel global as rotas:
  - admin-companies.js
  - admin-evaluations.js
  - admin-result.js
  - admin-manage-member.js
  - delete-evaluation.js
  - create-invitation.js
- As rotas continuam com validação same-origin e rate limiting existentes.
- O helper legado admin() e a variável ADMIN_API_TOKEN ainda permanecem no código/configuração como legado; as seis rotas acima não devem mais depender deles. Não remover o secret do ambiente até uma busca final por todas as referências e validação do Preview.

### Interface DEV
- admin.html e js/admin.js passaram a oferecer login com a conta individual existente, sem cadastro público.
- Primeiro acesso sem TOTP verificado orienta o cadastro de autenticador; acessos seguintes desafiam o segundo fator.
- Sessão administrativa usa sessionStorage e há ação para encerrar sessão.
- A conta cadastrada para o papel global já está identificada; não é necessário criar outra conta por fora.

### Verificações executadas
- Verificação estática de sintaxe JavaScript passou para js/admin.js, _shared.js e as seis rotas migradas, além de admin-session.js.
- SQL confirmou o papel global ativo para a conta e os privilégios restritos das duas RPCs.
- A consulta do Supabase Advisor continua mostrando alerta de leaked password protection desativada (restrição do plano Free) e RLS sem policies em tabelas acessíveis somente pelo backend. O segundo é intencional para as tabelas private do papel global; os alertas das tabelas públicas devem continuar sendo revisados conforme a arquitetura server-side.

### Limitações e validações pendentes
- Não foi realizado login real pelo navegador, cadastro/validação de TOTP, chamada autenticada às rotas, teste E2E ou pentest. A sintaxe estática e os testes SQL não comprovam funcionamento integral do fluxo.
- O Preview precisa ser publicado pelo pipeline e testado pelo responsável. Não há confirmação de deploy nesta rodada.
- Antes de retirar ADMIN_API_TOKEN do ambiente, fazer busca final em todo o repositório e validar as seis rotas no Preview.
- Nenhuma alteração foi feita na produção.


### Revisão complementar dos patches e controles (24/11/2026)
- Corrigida falha confirmada em functions/api/company-assessment-members.js: a rota chamava consumeRateLimit sem importar a função, o que causaria erro em tempo de execução. O import foi corrigido.
- Nos endpoints administrativos de listagem/consulta/exclusão, o rate limit por IP foi reposicionado antes da validação de sessão para reduzir chamadas desnecessárias ao Auth/RPC por requisições abusivas.
- Os arquivos migrados foram novamente submetidos à verificação estática de sintaxe; todos passaram.
- A branch DEV continua sem proteção de branch (GitHub retornou protected=false). Ainda é necessário exigir PR/revisão e checks antes de merge.
- Permanecem pendentes: revisão completa de XSS em renderizações DOM, catálogo canônico server-side das perguntas dinâmicas, teste de isolamento entre empresas, teste de sessão/MFA real, configuração Cloudflare e pentest.


### Validação de perguntas dinâmicas — DEV (24/11/2026)
- A rota functions/api/company-assessment-module.js agora compara os IDs enviados para os módulos segmento e contexto_industrial com as perguntas efetivamente ativadas pelo contexto persistido da avaliação.
- Para segmento, o servidor usa o setor registrado e a lista de perguntas correspondente.
- Para contexto_industrial, o servidor calcula os IDs de ramo (incluindo ramos personalizados) e de produto com a mesma normalização Unicode/slug usada pelo questionário.
- IDs inesperados são rejeitados; para concluir esses módulos, todas as perguntas dinâmicas ativas precisam estar presentes. Módulos sem perguntas ativas não podem ser concluídos.
- Testes isolados da lógica de validação confirmaram: lista esperada do setor, criação dos IDs de ramos/produtos com acentos, aceitação de conjunto completo, rejeição de conclusão incompleta e rejeição de chave artificial.
- Limite: essa checagem ocorre na rota backend antes do RPC. O RPC continua com padrões estruturais mais amplos para esses dois módulos; seu EXECUTE permanece restrito a service_role. Não houve teste E2E no navegador nem salvamento real com contas de empresas.


### Ajustes finais desta rodada (24/11/2026)
- O endpoint admin-session também recebeu rate limit por IP antes da validação de identidade.
- Os eventos de auditoria de exclusão, consulta de resultado, gestão de membros e criação de convites agora incluem identificadores/contexto da operação quando disponíveis.
- O formulário de login do painel mantém o e-mail inicial preenchido, mas permite alterá-lo; não existe fluxo de cadastro de administrador nessa página. A conta autorizada já existe no Auth DEV.
- HEAD DEV após esta rodada: 1f70e4d67b46f0afbcd3117a5f86d452743b7af9.


## Rodada complementar de endurecimento — 24/11/2026

### Correções de autenticação e administração
- Corrigida a chamada de listagem de usuários no painel global para usar db.auth.admin.listUsers.
- Corrigida a expressão regular de validação do TOTP de seis dígitos. Removido o handler de login legado que ainda tentava ler um campo adminToken inexistente e concorria com o fluxo individual.
- O fluxo de login agora reconhece fatores TOTP já verificados e também fatores ainda não verificados. Se uma configuração anterior ficou pendente, o sistema solicita o código desse fator em vez de tentar cadastrar outro.
- O painel continua usando sessionStorage, permite encerrar a sessão e exige AAL2 nas operações administrativas.
- Na gestão global de bloqueios, a API consulta e guarda o prazo de bloqueio anterior. Se a alteração do vínculo falhar, tenta restaurar o prazo original; se o rollback também falhar, informa que a conta exige verificação administrativa, sem declarar falsamente que foi restaurada.

### Isolamento dos ambientes
- functions/api/_shared.js agora permite conexão DEV somente na branch feature/1.2.0-contas-usuarios e conexão de produção somente na branch main. Qualquer outra branch ou ambiente sem identificação falha fechado, sem fallback para produção.
- O endpoint temporário dev-database-check.js foi removido para não expor informações desnecessárias sobre tabelas e conexão do banco.

### APIs e proteção contra abuso
- Corrigida a extração do Bearer token em assessment-result.js. A rota agora exige mesma origem e aplica limites por token e IP.
- Adicionados limites por IP aos fluxos públicos assessment-progress e assessment-submit, mantendo os limites por token.
- Adicionados limites por IP e/ou conta a accept-company-invitation, company-dashboard, company-members, my-company, create-company e invite-company-member.
- A notificação de conclusão da avaliação agora escapa o nome da empresa antes de inseri-lo no HTML do e-mail.

### Redução de superfície XSS e estabilidade
- company-assessments-page.js agora escapa o status recebido do servidor antes de renderizá-lo.
- js/app.js deixou de aceitar bodyHTML no diálogo genérico; o texto do diálogo é sempre inserido por textContent. O único HTML de campo usado pelo diálogo permanece como template interno fixo da solicitação de senha do backup.
- Corrigida uma expressão regular inválida em js/guide.js, que impedia o carregamento do guia interativo.

### Verificações executadas nesta rodada
- Verificação estática de sintaxe JavaScript passou nos arquivos das APIs e interfaces revisados (29 arquivos distintos ao longo da rodada, com nova checagem dos arquivos alterados por último).
- Teste isolado confirmou que a validação TOTP aceita seis dígitos e rejeita letras.
- Teste isolado da configuração de banco confirmou: branch DEV usa somente variáveis DEV; main usa somente variáveis de produção; branch desconhecida é bloqueada.
- Consulta ao banco confirmou RLS habilitado e ausência de privilégios diretos SELECT/INSERT/UPDATE/DELETE para anon e authenticated nas tabelas públicas de aplicação revisadas. As tabelas private de papel e auditoria também não são acessíveis diretamente por esses papéis. O acesso de serviço é feito pelo backend.
- A revisão do Supabase Advisor permanece com 14 alertas informativos de RLS sem policy e um alerta de proteção contra senhas vazadas desativada. Os alertas de RLS refletem a arquitetura server-side com privilégios diretos revogados; devem continuar monitorados, não ignorados automaticamente.

### Pendências e limites
- O repositório continua sem proteção de branch configurada (GitHub informou protected=false). O conector disponível permite leitura das regras, mas não alteração; configurar exigência de PR, revisão e checks no GitHub ainda depende de ação administrativa.
- Não foi realizado login real, cadastro TOTP em navegador, teste E2E, teste de isolamento com duas empresas, pentest ou verificação do painel Cloudflare/WAF.
- Não há confirmação de publicação do Preview. As verificações feitas foram de código, sintaxe e banco; não comprovam funcionamento visual ou deploy.
- O fluxo público de autoavaliação ainda precisa de validação server-side completa do catálogo de perguntas e da completude do payload antes da conclusão. A validação de respostas dinâmicas empresariais já existe na rota da avaliação empresarial, mas não deve ser confundida com validação integral do fluxo público.
- A proteção contra senhas vazadas permanece indisponível no plano Free da organização Supabase Mapa 360.
- Produção não foi alterada nesta rodada.


### Proteção contra falsa validação no fluxo público — DEV (24/11/2026)
- O endpoint assessment-submit.js agora normaliza a autoavaliação pública antes de gravá-la.
- Mesmo que o navegador envie evStatus='verificada', validatedLevel, validator ou validatedAt, o servidor remove esses valores. Evidência textual enviada pelo participante fica apenas como 'indicada'; sem evidência, fica 'nenhuma'.
- O servidor também limpa os campos de aprovação de oportunidades (status volta a 'Proposta', sem prioridade/aprovador/data), os campos de revisão dos pesos, a fase consultiva e o log local enviado pelo navegador.
- O registro recebe metadados server-side indicando canal public_invitation, validação not_consultatively_verified e horário de submissão do servidor.
- Respostas precisam ter IDs com formato conhecido (perguntas gerais, PPCP, módulos opcionais, segmentos, ramos e produtos); IDs arbitrários são descartados. Níveis inválidos são normalizados para sem resposta. Limites de 500 respostas, 5.000 caracteres por evidência e 100 oportunidades são aplicados.
- Testes isolados confirmaram que declarações de evidência verificada/aprovação são removidas, IDs válidos de ramo/produto/módulos são preservados e uma chave HTML artificial é descartada.
- Limite remanescente: a rota ainda não compara a lista de respostas com todas as perguntas ativas do contexto nem exige completude integral do questionário. Essa validação canônica server-side é uma próxima etapa; não afirmar que a autoavaliação pública já está integralmente validada.


### Validação server-side de completude da autoavaliação pública — DEV (24/11/2026)
- O endpoint functions/api/assessment-submit.js passou a reconstruir no servidor a lista de perguntas ativas com base no contexto enviado: módulo geral obrigatório; segmento selecionado e segmento válido; ramos; produtos; PPCP; automação; dados/BI; administrativo; projetos.
- A lista de perguntas usa os mesmos identificadores do instrumento 3.2.0: 18 gerais; bancos setoriais; perguntas contextuais específicas para ramos cadastrados e pergunta genérica para ramos sem banco específico; uma pergunta por produto; 20 PPCP; 10 por módulo transversal.
- A conclusão é recusada com HTTP 400 se faltar qualquer resposta ativa ou se o nível não for 1–5, ns ou na. A resposta informa quantidade de pendências e até 20 IDs para diagnóstico. “Não sei informar” e “Não se aplica” continuam sendo respostas válidas.
- Módulos desconhecidos, segmento fora do catálogo, listas malformadas, contexto industrial selecionado sem ramo/produto, identificadores de ramos/produtos repetidos após normalização e contextos excessivos são rejeitados.
- Respostas de perguntas que não estão ativas no contexto são descartadas. Campos de validação consultiva, aprovação, fase e log local continuam sendo removidos/normalizados; evidências públicas permanecem como indicadas.
- A normalização Unicode dos identificadores de ramo/produto foi testada com acentos e caracteres especiais, incluindo “Comércio / Distribuição”, “Serviços industriais” e “Sucroenergético”.
- Testes isolados executados: todos os oito segmentos do catálogo; ramos com banco próprio e ramos genéricos; produtos; combinação de todos os módulos (89 perguntas no cenário de teste); recusa de questionário geral incompleto (18 pendências); recusa com uma única pergunta faltante; rejeição de módulo desconhecido e lista inválida; remoção de chave artificial; remoção de autodeclaração de evidência verificada.
- A função SQL public.complete_m360_assessment continua com EXECUTE apenas para service_role; consulta de privilégios confirmou anon=false, authenticated=false e service_role=true. A conclusão é chamada pelo endpoint backend, que aplica a validação antes da RPC.
- Limite importante: o contexto de segmento, ramos, produtos e módulos é uma declaração do respondente. A API verifica consistência e completude do que foi declarado, mas não prova que a seleção representa a realidade da empresa. Essa verificação pertence à etapa consultiva.
- Não foi feito teste E2E no navegador, submissão real com convite, nem deploy/Preview verificado. Produção e dados existentes não foram alterados.


### Preparação do primeiro acesso do Administrador Global e rotina sem domínio próprio — DEV (24/11/2026)
- Consulta read-only ao Supabase DEV confirmou que a conta designada para Administrador Global já existe, está com e-mail confirmado e possui o papel `platform_admin` ativo. Não é necessário criar outra conta, nem cadastrar usuário diretamente no Supabase Dashboard.
- A mesma conta possui vínculo ativo com uma empresa no papel `member`. Esse papel empresarial é independente do papel global; não foi alterado nem promovido automaticamente a administrador da empresa.
- A consulta a `auth.mfa_factors` não encontrou fator TOTP cadastrado para a conta. Portanto, o primeiro acesso ao painel `/admin.html` deve iniciar a configuração do aplicativo autenticador. O login e o cadastro do TOTP não exigem domínio próprio nem envio de e-mail.
- O login real e a configuração do MFA ainda dependem de ação do usuário no navegador; não foram simulados porque exigem a senha pessoal e a interação com o autenticador. Nunca solicitar ou armazenar a senha do usuário no chat.
- Divergência identificada entre a decisão de produto e o código atual: `js/conta.js` ainda usa `supabase.auth.signUp({ email, password })`, trata a confirmação nativa como requisito para entrar quando não há sessão, e os endpoints de criação de empresa/aceitação de convite exigem `email_confirmed_at`. Não existe atualmente uma fila/worker de confirmação de e-mail opcional com envio pendente.
- A rotina de conta sem e-mail e e-mail opcional permanece pendente de implementação. Não improvisar username como e-mail real, nem usar endereço de domínio de terceiros. Antes da implementação, definir identificador de login exclusivo, credenciais individuais e recuperação segura sem e-mail; manter o e-mail de contato separado da identidade de autenticação quando ausente. A confirmação de contato, quando houver endereço, deve ser assíncrona e não bloquear acesso, com fila limitada e remetente configurável para o futuro.
- Não há necessidade de comprar domínio agora. Para convites empresariais atuais, a API gera link que o administrador pode copiar e compartilhar manualmente; não depende de remetente próprio. O SMTP padrão do Supabase não deve ser tratado como serviço de envio em produção.
- Produção não foi consultada nem alterada nesta verificação.


## Rotina de identidade sem e-mail obrigatório — inspeção de 24/11/2026

- HEAD consultado antes desta rodada: `8d9fc7e11e8fed9642568db6a85cee84e4af2c81`, branch `feature/1.2.0-contas-usuarios`.
- Inspeção confirmou que `js/conta.js` ainda usa `supabase.auth.signUp({ email, password })` e `signInWithPassword({ email, password })`; `conta.html` exige e-mail no cadastro e login.
- A confirmação nativa do Supabase ainda pode impedir que uma conta recém-criada obtenha sessão. As APIs `create-company.js`, `accept-company-invitation.js` e `invite-company-member.js` também exigem e-mail confirmado ou correspondência de e-mail.
- A coluna `m360_company_invitations.email` é obrigatória. O fluxo atual não aceita convite sem e-mail.
- As tabelas `m360_email_verifications` e `m360_email_status` existem no banco DEV, mas a inspeção não encontrou fila funcional/worker de entrega assíncrona. Não afirmar que a rotina de verificação está pronta.
- A arquitetura futura deve separar identificador de login e contato de e-mail, com autenticação server-side compatível com Supabase Auth, rate limits, resposta anti-enumeração, proteção contra força bruta, revogação de sessão e recuperação auditável.
- O e-mail opcional deve ser verificado em segundo plano. Se não houver domínio/remetente configurado, a fila deve manter a mensagem pendente e o acesso deve continuar funcionando. Não comprar domínio agora e não usar remetentes/domínios de terceiros.
- A recuperação de contas sem e-mail ainda exige decisão explícita. Alternativas documentadas: códigos de recuperação de uso único armazenados somente como hash e recuperação assistida com verificação de identidade, MFA e trilha de auditoria. Nenhum administrador poderá visualizar ou definir a senha do participante.
- Atualizada a documentação de arquitetura com o desenho, etapas e limites. Esta rodada não alterou código funcional, tabelas, usuários, convites, configurações Auth ou dados. Produção permanece intocada.
- Próxima etapa: decidir a política de recuperação sem e-mail; em seguida, preparar migração aditiva e implementar o fluxo completo na DEV, sem interromper contas existentes.


## Redefinição de senha pelo administrador da empresa — decisão 24/11/2026

- Decisão do produto: o administrador da empresa inicia a redefinição pelo painel de participantes; o sistema gera link temporário e o membro define a própria senha. O administrador nunca vê nem define a senha.
- O link deve funcionar sem e-mail e sem domínio próprio, com entrega privada/manual ao titular enquanto não houver remetente verificado.
- Implementação atual encontrada em `functions/api/company-manage-member.js` ainda usa `auth.admin.generateLink({type:'recovery', email})`; falha para contas sem e-mail e não representa o fluxo aprovado.
- Implementar tokens aleatórios CSPRNG (>=256 bits), armazenar somente hash, validade curta proposta de 30 minutos, uso único e consumo atômico em transação/RPC.
- Validar no servidor o administrador ativo e a empresa do membro; não permitir reset de membro de outra empresa, reset da própria conta por esse mecanismo ou reset de Administrador Global.
- Aplicar rate limit por IP/administrador/alvo, auditoria sem token/senha, invalidação de links concorrentes e revogação de sessões anteriores (testar comportamento efetivo).
- Não mudar senha na geração do link. Alteração ocorre somente após o membro abrir link válido e definir senha.
- Não ativar nem alterar produção nesta etapa.


## Correção do salvamento de respostas de módulos — 24/11/2026

- Causa confirmada no banco DEV: RPC `save_m360_company_assessment_module` chamava `jsonb_object_length(jsonb)`, função inexistente no PostgreSQL do projeto. O endpoint convertia o erro não classificado em mensagem genérica "Não foi possível salvar as respostas do módulo".
- `pgcrypto` e `extensions.digest(text,text)` foram verificados e estão presentes; não eram a causa.
- Aplicada migração `fix_jsonb_object_count_in_module_save`, substituindo a contagem por subconsulta sobre `jsonb_object_keys(p_answers)`. Definição original preservada e apenas expressão incompatível corrigida.
- Verificação posterior: nenhuma ocorrência de `jsonb_object_length` na função; nova contagem presente; `service_role` tem EXECUTE; `authenticated` não tem EXECUTE direto.
- Migração SQL versionada em `supabase/fix-jsonb-object-count-in-module-save.sql`.
- Ainda é necessário teste funcional de salvamento real no Preview com sessão autenticada. Não declarar resolvido antes dessa confirmação.
- Nenhum registro de avaliação foi alterado durante o diagnóstico. Produção não foi tocada.


## Confirmação funcional do salvamento — 24/11/2026
- O usuário repetiu o teste no Preview DEV após a migração `fix_jsonb_object_count_in_module_save` e confirmou: "Deu certo". Portanto, o salvamento de respostas de módulos fica marcado como funcionalmente confirmado na DEV.
- A correção técnica foi verificada no banco: expressão incompatível removida, contagem por `jsonb_object_keys`, EXECUTE restrito a `service_role`; usuário confirmou o comportamento real no aplicativo.
- Não generalizar essa confirmação para conclusão completa da avaliação, relatórios ou demais fluxos; esses testes permanecem pendentes.
- Quadro geral de etapas concluídas e pendentes consolidado na documentação de arquitetura em 24/11/2026.
- Produção permanece intocada.


## Recuperação de senha pelo painel — implementação parcial na DEV (24/11/2026)

- HEAD consultado antes das alterações: `dedf39e0ef55fab6dae2108061b8e91d7ac4f0f0`.
- Criadas tabelas privadas de tokens e eventos de segurança, RLS ligado e acesso direto revogado para usuários comuns.
- Criadas RPCs de emissão/consumo atômico com EXECUTE restrito a `service_role`; verificado por consulta de privilégios.
- Emissão exige administrador ativo da mesma empresa e alvo membro ativo de papel `member`. Bloqueia auto-reset e alvos com papel global.
- Token de 256 bits gerado pelo backend, persistido somente como SHA-256, expiração de 30 min, uso único e invalidação de tokens anteriores.
- `company-manage-member.js` emite link `member-recovery`; novo endpoint `member-password-reset.js` consome token e atualiza a senha via Auth Admin.
- `js/conta.js` reconhece link próprio, remove token da URL antes de exibir o formulário e envia nova senha ao endpoint. UI não oferece reset para outro administrador.
- SQL fonte versionado em `supabase/member-password-reset.sql`.
- Verificações do banco: tabelas presentes, RLS ativo na tabela de tokens, EXECUTE de RPCs permitido a service_role e negado a authenticated.
- Ainda não houve teste real de ponta a ponta no Preview. Não marcar recuperação completa até testar.
- Revogação de sessões: ainda não implementada. A documentação oficial do Supabase esclarece que revogar refresh tokens não invalida access JWT já emitidos, que permanecem válidos até expirar; para logout administrativo global é necessário JWT válido do usuário. Implementar política de sessões e validação de `session_id` nas rotas sensíveis, ou obter fluxo seguro para revogar refresh tokens.
- Produção não foi alterada. Não há domínio próprio exigido para este link; entrega é manual e privada.


## Administrador Master, reset de perfis administrativos e diálogos — 24/11/2026

- Corrigida a RPC de reset: a tabela `private.m360_platform_roles` usa `is_active`, não `status`. A condição foi corrigida.
- Redefinição de senha agora permitida pelo administrador ativo da empresa para membros e administradores empresariais, incluindo Administrador Master. Auto-reset e conta Administrador Global são bloqueados.
- Criado campo `is_master_admin` em `m360_company_members` e índice único parcial para limitar a um Master por empresa.
- RPC de gestão de membros protege o Master contra rebaixamento, bloqueio, transferência e remoção por administradores da empresa.
- RPC separada permite designar/remover Master apenas se o ator for `platform_admin` ativo; EXECUTE concedido somente a `service_role`. Verificação ACL confirmou negação para `authenticated` e `anon`.
- Endpoint do Administrador Global exige referência da solicitação formal do contratante ao remover o Master e passa essa referência ao log de auditoria da operação.
- A remoção do vínculo não apaga a conta de autenticação nem as avaliações.
- Interface de conta, painel global e página de avaliações empresariais substituíram confirmações nativas por diálogos próprios integrados ao estilo do aplicativo.
- Varredura dos arquivos JavaScript da pasta `js/` não encontrou `window.confirm`, `window.prompt` ou `window.alert`.
- Arquivo SQL fonte versionado em `supabase/company-master-admin-and-reset-fix.sql`.
- Não houve teste E2E no Preview; aguardar atualização e testar geração de link, reset de membro/admin/Master, proteção do Master, designação/remoção global com referência e diálogos.
- Produção não foi alterada.


### Ajustes complementares após revisão — 24/11/2026
- A redefinição de senha também foi liberada para Administrador Master; a proteção do Master se aplica à remoção/bloqueio/rebaixamento/transferência por administradores empresariais, não à recuperação de senha.
- Remoção do Master pelo Administrador Global agora exige referência da solicitação do contratante (mínimo de 5 caracteres) e inclui a referência no evento de auditoria de acesso global.
- ACL das três RPCs foi consultada após os ajustes: `service_role` pode executar; `authenticated` e `anon` não podem executar.
- Varredura de arquivos JavaScript e HTML do aplicativo não encontrou mais chamadas a diálogos nativos `window.confirm`, `window.prompt` ou `window.alert`.
- O Preview precisa atualizar para testar as telas e operações. Nenhuma remoção ou designação de Administrador Master foi executada em dados reais; o novo perfil ainda precisa ser atribuído a uma pessoa indicada pelo contratante.


- A remoção/designação do Administrador Master foi restringida a um proprietário único da plataforma (`is_platform_owner=true`) além do papel `platform_admin`. A única conta global ativa existente na DEV foi marcada como proprietária; contagem verificada: 1 global ativo / 1 proprietário.
- Outros Administradores Globais futuros não poderão gerir Master automaticamente. A operação também exige MFA no endpoint e referência formal do contratante para remoção.
