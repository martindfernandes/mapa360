# Mapa 360 — arquitetura de avaliações empresariais

## Estado desta etapa

- Ambiente de trabalho: branch `feature/1.2.0-contas-usuarios`.
- Banco de desenvolvimento: projeto Supabase `mapa360-dev`.
- Produção permanece separada e não foi alterada.
- O esquema do Supabase DEV foi consultado diretamente antes da preparação desta proposta.
- A migração `supabase/company-assessments.sql` foi aplicada ao banco DEV e registrada no histórico do Supabase. As tabelas foram verificadas após a aplicação.

## Estado encontrado no banco DEV

Na consulta realizada em 23/11/2026:

- `m360_companies`: 2 registros.
- `m360_company_members`: 3 registros.
- `m360_company_invitations`: 2 registros.
- `m360_invitations`, `m360_drafts` e `m360_submissions`: 0 registros.
- Histórico de migrations do Supabase: agora contém `company_assessments`.
- As tabelas existentes do esquema público consultadas estão com RLS habilitado e sem políticas; o acesso atual é feito pelas Cloudflare Functions com chave secreta do servidor.

Os dados de empresas, membros e convites existentes devem ser preservados. Nenhuma associação de avaliações antigas será feita automaticamente pelo nome da empresa.

## Modelo de dados proposto

### `m360_assessments`

Uma avaliação pertence a uma empresa. Guarda título, situação, autoria, datas, metadados compartilhados e, quando concluída, o resultado consolidado.

- `company_id`: empresa proprietária.
- `shared_payload`: contexto, participantes, objetivos, pesos, oportunidades, estimativas e demais dados comuns, sem a chave `answers`.
- `final_payload`: fotografia consolidada para relatório e consulta após conclusão.
- `legacy_invitation_id`: vínculo opcional com uma avaliação pública antiga, somente quando a associação for validada manualmente.

### `m360_assessment_modules`

Uma linha por módulo selecionado em cada avaliação.

- `module_id`: um dos oito módulos oficiais do questionário.
- `assigned_user_id`: responsável pelo módulo; nulo enquanto não atribuído.
- `answers`: respostas daquele módulo, sem sobrescrever respostas de outros módulos.
- `status`: pendente, em andamento ou concluído.

A migração inicial usa chaves estrangeiras, restrições, índices e RLS. Não cria políticas de acesso direto: a autorização será feita no backend, que usa a chave secreta do servidor. Nenhuma chave secreta será enviada ao navegador.

## Regras funcionais que as APIs deverão impor

1. Somente administrador ativo cria avaliações, seleciona módulos e atribui responsáveis.
2. O responsável comum só lê e grava os módulos atribuídos a ele.
3. Administrador ativo lê e edita todos os módulos da empresa.
4. Toda requisição valida a sessão no Supabase Auth e confirma o vínculo ativo com a mesma empresa.
5. A gravação de um módulo altera somente a linha daquele módulo.
6. O relatório completo é montado pelo servidor a partir do payload compartilhado e das respostas de todos os módulos.
7. O bloqueio de um participante deve impedir novas operações, mesmo que ele mantenha uma sessão antiga.
8. A remoção ou troca de responsável não apaga respostas existentes.
9. Avaliações públicas antigas permanecem nas tabelas atuais; a associação a uma empresa exige ação explícita e validação.

## Próximas etapas

1. Revisar a migração preparada e verificar restrições e privilégios.
2. Aplicar somente no Supabase DEV, após a revisão.
3. APIs iniciais criadas na branch DEV: `GET/POST /api/company-assessments` para listar/criar avaliações e `GET/POST /api/company-assessment-module` para consultar módulos, atribuir responsáveis e salvar respostas com controle otimista de concorrência.
4. Revisar as APIs e executar testes autenticados no Preview; os arquivos ainda não foram implantados/testados por navegador.
5. Adaptar o questionário atual para separar `shared_payload` e respostas por módulo, preservando o formato legado usado pelos relatórios.
6. Implementar a visão do administrador e a experiência do responsável.
7. Criar consolidação transacional do resultado final e testar duas empresas, isolamento entre empresas, permissões, retomada em outro dispositivo e relatórios.
8. Só considerar produção depois de testes completos e autorização explícita.

## Alertas e ajustes de segurança

- A função `public.rls_auto_enable()` é uma função de event trigger, não precisa ser chamada pela API. Foi aplicada uma migração separada para revogar EXECUTE de `public`, `anon` e `authenticated`. O Advisor deixou de apontar essa função como executável por usuários públicos/autenticados.
- As tabelas novas mantêm RLS habilitado e não concedem SELECT a `anon` ou `authenticated`; o backend usa `service_role` após validar sessão e permissões. O Advisor informa RLS sem policies, o que é intencional neste modelo de backend exclusivo, mas deve continuar assim enquanto não houver acesso direto pelo navegador.
- O Advisor também recomenda habilitar a proteção de senhas vazadas no Supabase Auth.
- Os endpoints atuais de convite/aceite e algumas operações exigem e-mail confirmado. Isso diverge da decisão de produto de que o e-mail é opcional e a confirmação nunca deve bloquear o acesso. Essa mudança deve ser planejada separadamente, considerando o fluxo de convite e a fila de confirmação; não foi alterada nesta etapa.

## Auditoria de integração com o questionário atual (23/11/2026)

### Formato e armazenamento atuais

- O instrumento atual usa `m360-assessment`, `schemaVersion: 3`.
- As respostas ficam em `A.answers`, indexadas pelo identificador único da pergunta (`question.id`). Cada resposta guarda nível, evidência, situação da evidência, confiança, respondente e dados de validação.
- O objeto da avaliação também contém dados compartilhados: `context`, `participants`, `objectives`, `target`, `weights`, `opportunities`, `estimate`, `followup` e `log`.
- O salvamento local usa `localStorage` (`m360.v3.draft`). O salvamento remoto atual chama `/api/assessment-progress` e grava o objeto inteiro em `m360_drafts.payload`, vinculado a `m360_invitations` pelo token público.
- A conclusão pública usa `/api/assessment-submit` e a RPC `complete_m360_assessment`, persistindo no modelo legado de convites/submissões.

### Mapeamento de perguntas para os oito módulos empresariais

- `geral`: perguntas de `GENERAL_QUESTIONS`.
- `segmento`: perguntas geradas por `segmentQuestions(sector)`.
- `ppcp`: perguntas de `PPCP_QUESTIONS`.
- `automacao`, `dados_bi`, `administrativo` e `projetos`: perguntas de `OPTIONAL_MODULE_QUESTIONS`, identificadas por `q.mod`.
- `contexto_industrial`: perguntas dinâmicas de `contextualQuestions(a)`. As perguntas podem ter `q.mod = ramo` ou `q.mod = produto`, mas ambas devem ser persistidas no módulo empresarial `contexto_industrial`.
- A seleção efetiva é formada por `selectedModuleIds(a)`; o módulo `geral` é sempre incluído.

### Incompatibilidade que precisa ser resolvida antes da ativação

O fluxo público atual e o fluxo empresarial usam credenciais diferentes:

1. `assessment-progress.js` valida o token público da avaliação, procura `m360_invitations.token_hash` e lê/grava `m360_drafts`.
2. `assessment-submit.js` também usa o token público e a RPC legada `complete_m360_assessment`.
3. As APIs novas `company-assessments.js` e `company-assessment-module.js` validam uma sessão Supabase Auth e o vínculo em `m360_company_members`.

Portanto, o adaptador do questionário deve oferecer dois modos explícitos: público/legado (sem alteração de comportamento) e empresarial/autenticado. Não reutilizar token público como JWT nem enviar o JWT para as APIs legadas.

### Estratégia de integração segura

1. Preservar o objeto interno `A` e o cálculo/relatório atuais. Criar um adaptador separado para converter entre `A` e o formato empresarial.
2. Montar um `shared_payload` sem `answers`, contendo contexto e demais dados compartilhados.
3. Distribuir `A.answers` por `question.id` e `q.mod`, traduzindo `ramo` e `produto` para `contexto_industrial`.
4. Ao abrir avaliação empresarial, recompor `A` a partir do payload compartilhado e das respostas dos módulos, sem alterar IDs de perguntas ou estrutura das respostas.
5. Em cada salvamento, enviar somente o módulo em edição e seu `updated_at` esperado; tratar conflito HTTP 409 sem sobrescrever dados de outra sessão.
6. Manter dados de perguntas arquivadas/desativadas. O adaptador deve mapear também perguntas inativas conhecidas, não somente `activeQuestions(a)`, e preservar qualquer resposta não mapeada em um campo de compatibilidade até sua classificação.
7. A conclusão empresarial deverá consolidar o payload compartilhado e todas as respostas no servidor, em operação atômica, antes de gerar o relatório. Não chamar a RPC pública legada nesse modo.

### Restrições e pontos pendentes

- O `index.html` carrega `js/app.js` como script clássico; a autenticação Supabase está inicializada separadamente nos módulos `js/account-menu.js` e `js/conta.js`. A integração deve reutilizar uma sessão Supabase Auth de forma controlada, sem duplicar clientes ou depender de nomes internos de `localStorage`.
- O código atual mantém rascunho local. No modo empresarial, o salvamento remoto deve ser a fonte de continuidade entre dispositivos; o cache local não pode substituir uma versão remota mais nova.
- Algumas APIs antigas de empresa ainda exigem e-mail confirmado. Isso continua divergente da decisão de produto de e-mail opcional e confirmação não bloqueante; revisar o fluxo como tarefa própria antes da disponibilização aos clientes.
- As APIs empresariais recém-criadas ainda não foram testadas ponta a ponta no Preview. A criação de avaliação e módulos ainda não usa transação atômica; corrigir isso antes da conclusão final.
- Nenhuma alteração no `js/app.js` foi feita nesta auditoria. Nenhum deploy foi realizado.

## Correção do carregamento da sessão ao abrir avaliação empresarial (23/11/2026)

Após teste manual do usuário, foi identificado o seguinte caminho: painel da empresa → criar avaliação → Abrir avaliação → retorno inesperado à tela inicial → Iniciar avaliação → bloqueio pela verificação Turnstile pública.

A mensagem Turnstile era consequência de cair no fluxo público, não uma falha dos dados obrigatórios. O fluxo empresarial depende de `window.M360Auth`, criado por `js/account-menu.js` como módulo ES. Os scripts clássicos `defer` podem executar antes do módulo terminar sua inicialização. O adaptador empresarial agora aguarda até 10 segundos pela API de autenticação e então obtém a sessão atual, evitando a condição de corrida.

Também foi adicionado um bloqueio para impedir que um link com `?company-assessment=<id>` seja iniciado como avaliação pública se o carregamento empresarial falhar. A referência dos scripts recebeu nova versão para invalidar cache.

Teste pendente: reabrir uma avaliação pelo painel e confirmar que o questionário empresarial carrega diretamente, sem clicar em "Iniciar avaliação" na tela inicial. O carregamento e o salvamento ainda não foram validados ponta a ponta no navegador.

## Restrição de acesso do participante e conclusão de módulo (23/11/2026)

Ajuste complementar feito no questionário empresarial:

- Participante comum navega somente entre Contexto (leitura) e Questionário; etapas de objetivos, maturidade e relatório ficam fora da navegação dele.
- O contexto e os dados gerais permanecem somente para leitura para participantes.
- As perguntas exibidas são filtradas pelos módulos atribuídos ao usuário. O backend repete a validação antes de cada leitura/gravação; não depende apenas da interface.
- Ao clicar em "Concluir módulos", o sistema tenta primeiro salvar as respostas pendentes e depois marca como concluídos os módulos atribuídos ao participante. Se houver conflito ou erro, a tela informa e não descarta as respostas já persistidas.
- O participante retorna ao painel após a conclusão. O administrador continua podendo abrir a avaliação completa e consultar/editar todos os módulos.
- O fluxo público não pode ser iniciado nem uma avaliação empresarial substituída por rascunho local enquanto o modo empresarial estiver aberto.
- Antes de sair com salvamento pendente, o navegador solicita confirmação para reduzir risco de perder alterações ainda não sincronizadas.

A conclusão global da avaliação e o relatório consolidado continuam pendentes; concluir um módulo não equivale a finalizar a avaliação empresarial.

## Ajustes de índices e verificação de segurança DEV (23/11/2026)

- Criado `supabase/company-assessment-indexes.sql` e aplicada no projeto `mapa360-dev` a migração `20261123150113 company_assessment_indexes`.
- Foram adicionados índices para as FKs de `m360_assessment_modules` (`assessment_id, company_id`, `assigned_user_id`, `updated_by`) e de `m360_assessments` (`created_by`, `updated_by`). A consulta posterior do advisor de performance deixou de apontar FKs sem índice nessas duas tabelas; os avisos restantes referem-se a tabelas anteriores de contas/convites.
- O advisor de segurança reporta RLS habilitado sem policies nas tabelas públicas, incluindo as tabelas empresariais. Isso é intencional neste desenho: as tabelas empresariais não concedem acesso direto a `anon`/`authenticated`; as Cloudflare Functions usam `service_role` após validar sessão, empresa, papel e atribuição. A conferência de privilégios no banco confirmou `SELECT` negado a `anon` e `authenticated` e permitido a `service_role` nas duas tabelas empresariais. Não criar policies permissivas sem revisar esse modelo.
- O advisor também reporta a proteção de senha comprometida do Supabase Auth desabilitada. Não alteramos essa configuração; é um ajuste administrativo separado que precisa ser avaliado antes da produção.
- A migração foi aplicada somente no projeto DEV. Nenhuma tabela, registro ou configuração de produção foi alterada.

## Integração inicial do questionário empresarial (23/11/2026)

Foi conectada a página de gestão ao questionário atual por meio do parâmetro `?company-assessment=<id>`:

- O painel agora apresenta "Abrir avaliação" em cada avaliação listada.
- `js/app.js` reconhece o identificador empresarial e carrega a avaliação autenticada diretamente do backend antes de renderizar a tela. Nesse modo, não lê nem usa o rascunho público/local como fonte de dados.
- O administrador recebe todos os módulos da avaliação. O participante recebe somente os módulos atribuídos ao seu usuário.
- Para participantes, as perguntas são filtradas por módulo; campos de contexto e dados compartilhados ficam somente para leitura. O administrador pode editar os dados gerais e as respostas de todos os módulos.
- O salvamento automático empresarial envia `shared_payload` pelo endpoint versionado somente quando o administrador altera os dados compartilhados; respostas são enviadas separadamente por módulo.
- O salvamento por módulo usa o `updated_at` recebido do servidor. Conflitos HTTP 409 são apresentados ao usuário, sem sobrescrever a versão mais recente.
- O salvamento empresarial não grava o objeto inteiro em `localStorage` e não chama as APIs públicas `assessment-progress` ou `assessment-submit`.
- O envio/conclusão pelo botão legado foi bloqueado no modo empresarial até existir a consolidação transacional e o relatório final. Isso evita concluir parcialmente ou gravar no fluxo público por engano.
- A versão da avaliação (`m360_assessments.updated_at`) foi separada da versão das respostas dos módulos: salvar um módulo não invalida a versão dos dados compartilhados.
- A resposta da API para participantes remove `legacy_unmapped_answers` do payload compartilhado para não expor respostas antigas não classificadas de outros módulos.

### Conferência do Supabase DEV

A integração Supabase disponível foi usada para leitura do projeto real `mapa360-dev` (`adelbfwfyferfqudhuka`), confirmado como `ACTIVE_HEALTHY`. As migrações `20261123144216 company_assessments` e `20261123144253 restrict_rls_event_function` constam como aplicadas.

O esquema real de `m360_assessments` e `m360_assessment_modules` corresponde às colunas e constraints previstas no SQL versionado, incluindo chave estrangeira composta por avaliação/empresa, estados válidos e RLS habilitado. No momento da consulta, ambas as tabelas tinham zero registros. As tabelas de empresas e membros tinham, respectivamente, dois e três registros; nenhum dado foi alterado nesta conferência. Nenhuma consulta foi feita ao projeto de produção.

### Limites e testes pendentes

- O código está no GitHub DEV, mas não foi possível acessar a URL Preview pela ferramenta de navegação. Não foi possível fazer teste de navegador ou ponta a ponta.
- Não há workflow de CI/testes reportado para o commit consultado.
- O administrador precisa preencher o contexto da empresa (incluindo segmento) antes de participantes responderem módulos que dependem dessas informações.
- O painel ainda não cria a avaliação a partir de um objeto completo do questionário; a avaliação começa com estrutura-base e o administrador preenche o contexto ao abri-la.
- Ainda faltam: consolidação transacional dos módulos, conclusão empresarial, geração/consulta do relatório final, validação de permissões em duas empresas, testes com dois participantes simultâneos e revisão do requisito de e-mail opcional/confirmacão não bloqueante.
- Não foi realizado deploy manual nem alteração na produção.

## Painel inicial de avaliações empresariais (23/11/2026)

Foram adicionados à branch DEV:

- `functions/api/company-assessment-members.js`: lista participantes da empresa somente para administradores ativos. Os nomes/e-mails são consultados no Supabase Auth Admin e nunca enviados ao navegador a partir de credenciais privilegiadas.
- `company-assessments.html` e `js/company-assessments-page.js`: primeira interface para listar avaliações, criar avaliação e distribuir cada módulo entre participantes ativos.
- Link "Avaliações da empresa" no menu da conta em `index.html`.
- O painel oculta controles de distribuição para participantes comuns. O backend também valida o papel e o vínculo em todas as operações.

### Limites atuais do painel

O painel permite criar e distribuir avaliações, mas ainda não abre o questionário para responder. A abertura do instrumento, o carregamento remoto antes da edição, o salvamento automático por módulo, a consolidação e o relatório empresarial permanecem pendentes. Avaliações criadas por este painel ainda começam com `shared_payload: {}`; o adaptador já suporta payload completo e expõe `updateShared` para persistir os dados gerais com controle de concorrência, mas a interface de criação ainda não importa o contexto do questionário.

### Verificação

Os arquivos foram relidos no GitHub DEV após os commits. A URL Preview não pôde ser acessada pela ferramenta de consulta externa; portanto, não afirmar que o painel foi implantado nem testado no navegador. Nenhum deploy manual foi realizado e produção não foi alterada.

## Adaptador cliente inicial (23/11/2026)

Foi adicionado `js/company-assessment-adapter.js` e incluído no `index.html` antes de `js/app.js`. O adaptador:

- Expõe `window.M360CompanyAssessment` com operações de listar, criar, carregar, atribuir e salvar módulos usando as APIs empresariais.
- Obtém o token de sessão por `window.M360Auth.getSession()`; `js/account-menu.js` expõe essa função reutilizando a instância Supabase Auth já inicializada, sem criar um segundo cliente.
- Mapeia `q.mod = ramo` e `q.mod = produto` para `contexto_industrial`.
- Separa respostas por módulo e recompõe o objeto `m360-assessment` mantendo os IDs e os objetos de resposta originais.
- Preserva respostas arquivadas/não classificadas em `shared_payload.legacy_unmapped_answers`, para não descartá-las durante uma futura migração.
- Detecta IDs duplicados ao recompor respostas de módulos diferentes.
- Envia sempre o token de sessão nas APIs e não reutiliza o token público do fluxo legado.

### Limite e segurança de ativação

Este commit cria a camada de integração e a disponibiliza para uso pelo código, mas ainda não liga automaticamente a tela atual do questionário ao modo empresarial. A ativação automática agora seria prematura: o app ainda inicializa um rascunho local e pode iniciar o fluxo público/Turnstile antes de decidir o modo. O próximo passo deve ser implementar a seleção explícita de avaliação empresarial e carregar o payload remoto antes de permitir edição, garantindo que um rascunho local antigo nunca sobrescreva o estado remoto.

Não foi realizado deploy nem teste de navegador/Preview. O fluxo público legado permanece sem alterações funcionais.

## APIs iniciais adicionadas ao GitHub DEV

- `functions/api/company-assessments.js`: autentica o usuário, valida vínculo ativo com a empresa, lista avaliações; somente administrador cria avaliação e seus módulos oficiais. Participante comum recebe apenas avaliações nas quais possui ao menos um módulo atribuído.
- `functions/api/company-assessment-module.js`: consulta dados compartilhados e módulos; administrador consulta todos, participante comum somente os atribuídos. Permite ao administrador atribuir/desatribuir módulo a membro ativo da mesma empresa. Permite salvar respostas somente no módulo autorizado, com comparação de `updated_at` para detectar gravações concorrentes. A ação `update_shared` permite somente ao administrador atualizar `shared_payload`, também com comparação de versão.
- Ambos os endpoints bloqueiam acesso fora da branch DEV, exigem mesma origem e validam o token de sessão com Supabase Auth. Nenhuma chave secreta vai ao navegador.

Essas APIs são uma primeira camada de backend, ainda sem integração com a interface e sem testes de ponta a ponta. A consolidação final ainda não foi criada. A criação de avaliação usa duas operações sequenciais; caso a criação dos módulos falhe, tenta remover a avaliação recém-criada. Antes de produção, essa operação deve ser substituída por transação/RPC atômica.

## Limites desta etapa

Foram aplicadas somente duas migrações aditivas no Supabase DEV: criação das tabelas de avaliação/módulos e revogação de execução pública da função interna de RLS. Não houve alteração nem exclusão de dados existentes. Foram adicionados dois endpoints ao GitHub DEV; nenhum deploy foi realizado. O questionário atual e a interface ainda não foram alterados.


## Correção da validação do segmento antes de avançar (23/11/2026)

Foi ajustado `js/app.js` para sincronizar o valor atual do campo `Segmento principal` (`#f-context-sector`) diretamente com `A.context.sector` imediatamente antes da validação da etapa Contexto. Isso protege contra a condição em que o clique em “Próximo” ocorre antes de o evento `change` do navegador atualizar o estado interno, o que fazia a validação interpretar o segmento como vazio. A referência de cache de `js/app.js` em `index.html` foi atualizada. Commit na branch DEV; teste manual no Preview ainda necessário. Nenhuma alteração em produção ou nos dados do Supabase.

## Correção da renderização do questionário empresarial (23/11/2026)

Após o teste manual, foi identificado que activeQuestions() tentava consultar host.querySelector(...), mas a variável host só existe no escopo de renderStep(). Ao avançar de Contexto para Questionário, essa referência causava erro JavaScript durante a montagem das perguntas; a navegação mudava o índice da etapa, porém o conteúdo permanecia na tela anterior.

Correção aplicada na branch DEV:
- Removida de activeQuestions() a tentativa de manipular o DOM por meio da variável fora de escopo.
- A renderização do campo Turnstile foi condicionada diretamente em renderContext(): ele só aparece no fluxo público e não é incluído no modo de avaliação empresarial.
- Atualizada a versão de cache de js/app.js em index.html.

Commits:
- 4ac0a4ba5de481095fe6b186fc85725eb58d3ed9 — correção da renderização empresarial.
- 07f8f8183663aee4e6c2992727d3a70549f3453e — atualização da versão do script.

A correção foi conferida por releitura do arquivo no GitHub DEV. Ainda depende de teste manual no Preview para confirmar que as perguntas aparecem e que o fluxo público continua exibindo a verificação de segurança. Produção e dados do Supabase não foram alterados.

## Experiência de entrada e guia inicial (23/11/2026)

- A tela inicial autenticada foi reorganizada com mensagem acolhedora, chamada principal para Minhas avaliações e explicação das três etapas de valor: entender o cenário, encontrar oportunidades e planejar a evolução.
- Foi criado guia de primeiro acesso em quatro passos, exibido apenas para sessão autenticada e com opção de pular/fechar. A conclusão é registrada localmente no navegador; existe ação para rever o guia na tela inicial.
- O guia direciona ao painel existente de avaliações empresariais, sem duplicar cadastro, APIs ou regras de negócio.
- Arquivos: css/onboarding.css, js/onboarding.js e index.html.
- Limitação desta primeira entrega: o guia é geral e não detecta ainda o papel de administrador/participante para personalizar o conteúdo. A validação visual e funcional depende de teste manual no Preview.
- Mantido todo o trabalho na branch DEV; nenhuma alteração em produção ou no banco foi feita.


## Simplificação da gestão de avaliações (23/11/2026)

- A página de avaliações foi redesenhada para apresentar uma introdução mais clara, lista de avaliações e ação principal de criar nova avaliação.
- O formulário de criação fica recolhido até o administrador escolher “Nova avaliação”; mantém os módulos oficiais e o diagnóstico geral obrigatório.
- Após criar, a interface oferece “Responder agora” e “Voltar à lista”, evitando exigir que a pessoa localize a avaliação recém-criada.
- A lista mostra situação, data, quantidade de módulos e contagem de módulos concluídos. O administrador continua podendo atribuir cada módulo aos participantes na própria lista.
- Participante comum vê apenas as avaliações/módulos que a API já autoriza, sem controles administrativos.
- Estilos movidos para css/company-assessments.css; lógica da página permanece em js/company-assessments-page.js. APIs e regras de autorização não foram alteradas.
- Validação manual no Preview ainda pendente. Conferir especialmente criação, abrir avaliação, atribuição de módulos e visualização com conta de participante.


## Conclusão transacional e resultado empresarial (23/11/2026)

- Criada no Supabase DEV a RPC `complete_m360_company_assessment`, com bloqueio da linha da avaliação (`FOR UPDATE`), validação do administrador ativo da empresa, validação do estado, consolidação das respostas JSONB dos módulos, detecção de IDs duplicados e gravação atômica de `final_payload`, `status=completed` e `completed_at`.
- A função só pode ser executada pela role interna `service_role`; não concede execução a `anon`, `authenticated` ou `PUBLIC`. A Cloudflare Function valida previamente o token Supabase, empresa e papel antes de chamar a RPC.
- O endpoint empresarial agora oferece ação `complete` exclusiva do administrador e devolve o payload consolidado; GET também entrega o payload final para consulta após reabrir.
- O questionário empresarial agora salva antes de concluir, permite ao administrador concluir módulos não atribuídos, exige que módulos atribuídos a outros participantes já estejam concluídos e chama a consolidação atômica. O relatório usa a mesma estrutura de avaliação já existente, sem chamar a API pública legada.
- Após conclusão, o resultado consolidado é usado para renderizar o relatório executivo; ao reabrir, o app carrega `final_payload` persistido.
- A conclusão é idempotente: reenvio de uma avaliação já concluída retorna o mesmo payload final. A avaliação concluída fica bloqueada para alterações pelas APIs existentes.
- Migração DEV: `company_assessment_atomic_completion`. Nenhuma alteração em produção ou exclusão de dados foi realizada.
- Testes automatizados/end-to-end e conferência no Preview ainda pendentes; não declarar a funcionalidade validada até realizar teste com uma avaliação preenchida e módulos atribuídos a mais de um participante.
