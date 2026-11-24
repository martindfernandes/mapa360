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


## Verificação de persistência e guia por perfil (23/11/2026)

### Conferência da avaliação concluída em DEV

- Consulta direta ao banco `mapa360-dev` confirmou a avaliação `Teste 2026` com status `completed` e data de conclusão `2026-11-23 20:29:01 UTC`.
- O campo `final_payload` está persistido como objeto JSONB (1.735 bytes na consulta de verificação), com contexto, respostas e demais seções do instrumento.
- O módulo `geral` está com status `completed`; suas 18 respostas foram gravadas em `m360_assessment_modules.answers` e também aparecem no resultado consolidado `m360_assessments.final_payload.answers`. A consulta verificou 18 respostas com nível preenchido e nenhuma resposta sem nível.
- O contexto consolidado contém nome de empresa e segmento. A consulta encontrou zero campos de evidência preenchidos nesta avaliação de teste; isso não impede a persistência das respostas, mas significa que o teste não validou anexos/evidências.
- O banco confirma que os dados foram gravados. Ainda falta testar reabertura pelo navegador e confirmar que o relatório visual os apresenta corretamente.

### Guia interativo do Mapa 360

- Criado `js/guide.js` e `css/guide.css`, integrados à tela inicial, Minha conta e Minhas avaliações.
- O primeiro acesso autenticado inicia o percurso conforme o papel retornado pela API da empresa: administrador ou membro.
- Guia do administrador: entrada, cadastro da empresa quando necessário, convites, gestão de participantes (nome, papel, bloqueio, remoção e redefinição de senha), criação de avaliações, atribuição de módulos a diferentes responsáveis, questionário, referências/benchmarks e conclusão/relatório.
- Guia do membro: avaliações disponíveis, abertura da atividade atribuída, preenchimento dos módulos e salvamento; esclarece que a conclusão geral e o relatório são responsabilidade do administrador.
- O guia navega entre as páginas, destaca o elemento correspondente, mostra progresso e permite encerrar/rever. O estado de primeira visita é mantido no navegador.
- O tour aguarda o carregamento dos elementos dinâmicos antes de destacá-los; se a empresa já estiver cadastrada, pula a etapa de cadastro.
- As descrições se limitam às funções presentes no código atual; não prometem recursos que ainda não estão disponíveis.
- Integração e fluxo ainda precisam de validação manual no Preview DEV com uma conta administradora e uma conta membro.


## Atualização — apresentação guiada v4 (2026-11-23)

- O guia foi reestruturado como apresentação/tour de navegação, inspirado em tours de aplicativos bancários: destaca a área relevante, apresenta sua finalidade e permite avançar/voltar sem executar cadastros ou alterar avaliações.
- Guia do Administrador: início; conta/empresa; gestão de participantes; convites; área de avaliações; botão de nova avaliação (abre apenas o formulário para demonstração); lista e distribuição; encerramento no início.
- Guia do Participante: área de avaliações, atividades atribuídas e orientação de uso/salvamento. A abertura do questionário depende de uma avaliação atribuída e deve ser validada no navegador.
- O encerramento marca a apresentação como vista em `m360_guide_v3_seen`; a opção “Rever apresentação” continua disponível nas páginas internas.
- O painel do tour tem rolagem própria, limite de altura e regras responsivas para telas estreitas.
- Arquivos atualizados na branch DEV: `js/guide.js`, `css/guide.css`, `index.html`, `conta.html`, `company-assessments.html`.
- Commits:
  - `f989b3fd1bec6457a119cb0cc181e6be2525286e` — novo fluxo do guia.
  - `c2bb577fa34beedb018c6934a47eeef2379094f6` — CSS responsivo do guia.
  - `5c00d2c7b94a1d06f898ae0b1d2465e902a34e3a` — versão do guia em conta.
  - `26fd16861568af49070aa71c498b03317758e513` — versão do guia na página inicial.
  - `422ccf5c63e14b2ce57c1ab5b66335a99c68b02d` — versão do guia na área de avaliações.
- Ainda não validado em navegador: sequência completa entre páginas, comportamento do destaque quando os painéis estão ocultos, guia do participante e layout integral desktop/mobile do aplicativo. Esta entrega adapta o painel do guia; não representa ainda a reformulação completa das telas do produto.


## Gestão editável das avaliações — configuração e histórico (23/11/2026)

- O administrador pode alterar o título de uma avaliação enquanto ela estiver em rascunho/em andamento.
- Pode adicionar módulos oficiais depois da criação; o Diagnóstico geral permanece obrigatório.
- Pode remover somente módulos ainda pendentes, sem respostas e sem atividade. Módulos com respostas ou status diferente de pendente são preservados e a API recusa a remoção, orientando a trocar o responsável em vez de apagar o histórico.
- A distribuição de responsáveis continua disponível no cartão da avaliação. Alterar o responsável não apaga respostas; o acesso passa a seguir a atribuição vigente.
- Avaliações concluídas ou arquivadas ficam bloqueadas para mudanças de título, módulos e responsáveis.
- A interface oferece um painel recolhível “Editar avaliação e módulos”, com formulário para nome, lista dos módulos atuais, ação de remoção segura e seleção de novos módulos.
- O backend valida administrador, vínculo ativo, empresa proprietária, estado da avaliação, IDs oficiais e concorrência por versão. Nenhum acesso direto do navegador ao banco foi aberto.
- Criada a tabela m360_assessment_events no Supabase DEV, com RLS habilitado e acesso somente via service_role, para registrar alterações administrativas (nome, módulos e responsáveis). A tabela usa chave estrangeira composta para garantir que o evento pertença à mesma empresa da avaliação.
- Arquivos atualizados: functions/api/company-assessment-module.js, js/company-assessments-page.js, css/company-assessments.css, company-assessments.html.
- Migração DEV: assessment_configuration_audit.
- Ainda pendente de teste manual no Preview: editar nome, adicionar módulo, remover módulo pendente, tentar remover módulo com respostas, trocar responsável com respostas existentes e confirmar bloqueio de avaliação concluída/arquivada. Não houve alteração em produção.

- Complemento da criação: o formulário agora permite selecionar os módulos e indicar o responsável de cada um já no primeiro cadastro, ou deixar a distribuição para depois. O endpoint valida que todos os responsáveis selecionados sejam membros ativos da mesma empresa antes de criar as linhas dos módulos.
- Segurança adicional: ao trocar o responsável de um módulo que já tenha atividade, a interface pede confirmação e explica que as respostas serão preservadas e ficarão visíveis ao novo responsável.


## Triagem inicial obrigatória antes do primeiro convite (24/11/2026)

- A etapa Contexto existente é a primeira parte da triagem administrativa: identificação, localização, segmento, porte, escopo, dificuldades e perfil estratégico/industrial.
- Enquanto a triagem não estiver concluída, o administrador visualiza apenas as 18 perguntas do Diagnóstico geral no questionário empresarial. Os módulos adicionais ficam reservados para distribuição posterior.
- As 18 perguntas gerais precisam receber resposta válida (níveis 1 a 5, “Não sei informar” ou “Não se aplica”). O Contexto continua exigindo empresa, estado, município e segmento.
- A conclusão é registrada no Supabase DEV em `shared_payload.triage_completed_at` e `triage_completed_by`; o módulo `geral` recebe status `completed`. Nenhuma tabela ou migração adicional foi criada.
- A API de convites valida no servidor a existência de uma triagem concluída antes de permitir o primeiro membro ativo. Convites subsequentes de empresas que já possuem mais de um membro ativo não são bloqueados.
- O Diagnóstico geral fica reservado ao administrador: a interface não oferece atribuição e a API recusa sua atribuição a participantes.
- Na tela Contexto, o administrador recebe orientação para concluir a triagem; após concluir, o link “Adicionar membros” abre a tela de conta diretamente no formulário de convites.
- A criação da avaliação explica a sequência: triagem administrativa, convites e distribuição dos demais módulos.
- Alterações somente na branch DEV. Nenhuma migração, exclusão ou alteração de dados existentes/produção foi realizada. Testes no Preview e ponta a ponta ainda necessários.


## Participação de membros é opcional (24/11/2026)

- A triagem inicial do administrador é obrigatória; adicionar membros não é.
- O administrador pode conduzir sozinho toda a avaliação: preencher Contexto, responder o Diagnóstico geral e todos os módulos adicionais, concluir a avaliação e consultar o relatório.
- Módulos adicionais sem responsável atribuído permanecem disponíveis para edição e conclusão pelo administrador. A API permite explicitamente ao administrador salvar e concluir módulos sem atribuição individual.
- A seleção de responsável vazia significa “Responder como administrador”; a interface deixa essa possibilidade explícita tanto na criação quanto na distribuição dos módulos.
- Convites só são necessários quando a empresa deseja dividir o preenchimento entre participantes. O bloqueio de convite continua restrito ao primeiro convite e serve apenas para garantir que a triagem inicial esteja concluída; não existe bloqueio de conclusão da avaliação por ausência de membros.

## Nova etapa de experiência: início por perfil e navegação principal (24/11/2026)

### Requisitos definidos pelo usuário — ainda não implementados

- A página institucional atual (chamada “Vamos evoluir sua empresa?”, com “Começar agora” e “Conhecer o Mapa 360 · Guia rápido”) deve existir somente para visitantes sem cadastro/sessão ativa.
- Usuário autenticado com vínculo ativo não deve retornar à página institucional ao clicar em “Início”. Deve abrir um painel interno adequado ao seu perfil.
- Início do administrador:
  - dados e identificação da empresa;
  - resumo da triagem inicial e das respostas já registradas;
  - percentual de avanço do questionário/avaliação;
  - módulos concluídos, em andamento e pendentes;
  - responsáveis por módulo e identificação de quem já respondeu;
  - visão das avaliações da empresa e atalhos para continuar/criar avaliação.
- Início do membro:
  - avaliações às quais tem acesso;
  - módulos/atividades atribuídos à sua conta;
  - pendências, andamento e itens concluídos;
  - atalhos para abrir diretamente a próxima atividade pendente;
  - não exibir respostas ou módulos de outros participantes sem permissão.
- Navegação principal no cabeçalho, separada do menu da conta: Início; Minha empresa; Avaliações da empresa.
- Menu da conta restrito a: Minha conta; Segurança; Sair.
- A área “Minha empresa” deve concentrar dados cadastrais da empresa e gestão de participantes (para administradores), sem misturar essas funções no menu de conta.
- O botão/rota Início deve respeitar autenticação e perfil: visitante → página institucional; administrador → dashboard da empresa; membro → painel de pendências.
- O desenho deve ser responsivo desde a implementação: navegação confortável em desktop e mobile, cabeçalho adaptável, cartões empilhados em telas estreitas, sem tabelas largas obrigatórias no celular e sem perda de ações importantes.
- Preservar a página institucional e o fluxo de primeiro acesso por entrada=admin; não confundir usuário autenticado sem empresa com administrador já vinculado.
- Preservar o guia de primeiro acesso e “Rever apresentação”, sem executar ações do usuário automaticamente.

### Inspeção técnica realizada para preparar a implementação

- index.html contém atualmente a página institucional no #homeScreen; js/app.js sempre chama showHome() para a rota pública principal quando não há token público, sem consultar a sessão Supabase nem o vínculo empresarial.
- js/account-menu.js já obtém sessão e mostra menu de conta, mas hoje inclui links “Avaliações da empresa”, “Minha conta”, “Minha empresa” e “Segurança e senha”. O menu precisa ser simplificado para Minha conta, Segurança e Sair.
- company-assessments.html já oferece a lista de avaliações, criação e distribuição de módulos. Seu cabeçalho atual só tem “Início” e menu da conta.
- functions/api/company-assessments.js GET já filtra avaliações/módulos por papel e por atribuição do membro; para o administrador, retorna metadados de módulos, mas ainda não devolve os dados agregados necessários ao dashboard (respostas da triagem, progresso por pergunta, nomes de responsáveis e autoria da última resposta).
- functions/api/my-company.js retorna dados básicos da empresa e papel; functions/api/company-members.js fornece membros e nomes/e-mails para administradores. Essas rotas podem servir como base para “Minha empresa”.
- conta.html hoje reúne autenticação, dados da empresa, convites e administração de participantes; a navegação nova deverá separar conceitualmente “Minha conta” de “Minha empresa”, evitando duplicar formulários ou quebrar convites/gestão existentes.
- Nenhuma alteração de código foi feita nesta etapa de layout. Esta seção registra requisitos e diagnóstico, não uma implementação concluída.

### Pendências atualizadas — ordem sugerida

1. Implementar roteamento de início por sessão/papel, mantendo a página institucional apenas para visitantes e primeiro acesso sem empresa.
2. Criar dashboard de administrador com empresa, triagem respondida, progresso por avaliação/módulo, responsáveis e autores das respostas. Definir indicadores de avanço sem contar módulos opcionais como obrigatórios quando não selecionados.
3. Criar dashboard de membro com suas próprias pendências, progresso e atalhos, respeitando o filtro por atribuição no servidor.
4. Implementar navegação principal responsiva: Início, Minha empresa, Avaliações da empresa.
5. Separar a página “Minha empresa” da página “Minha conta”; mover/organizar gestão de participantes e convites para Minha empresa. Manter em Minha conta apenas dados pessoais, segurança/senha e sair.
6. Simplificar o menu de conta para Minha conta, Segurança e Sair e alinhar cabeçalhos entre as páginas internas.
7. Testar a experiência em desktop, tablet e celular; testar visitante, administrador, membro, usuário sem empresa, convite e sessão expirada.
8. Testar o fluxo completo de triagem obrigatória e convites opcionais: administrador sozinho conclui todos os módulos e relatório; alternativa com membros convidados e distribuição.
9. Validar reabertura da avaliação, relatório final visual, múltiplos participantes simultâneos, concorrência 409, isolamento entre empresas e bloqueio de membros desativados.
10. Testar edição de nome/exclusão de participantes e revisar e-mail opcional/confirmação não bloqueante.
11. Fazer revisão final de segurança e release somente após autorização expressa. Produção permanece intocada.

### Estado de branch e ambiente na atualização

- Repositório: martindfernandes/mapa360.
- Branch de trabalho: feature/1.2.0-contas-usuarios (DEV).
- HEAD confirmado nesta atualização: 3d21cf2f96533f8d39a0754ed0cc47feb7c5b8c9.
- Preview: https://feature-1-2-0-contas-usuario.mapa360.pages.dev/.
- Supabase DEV: mapa360-dev / adelbfwfyferfqudhuka.
- Não houve alteração no Supabase nem em produção nesta atualização.
- O último conjunto de commits de triagem/participação opcional está na branch DEV; o comportamento ainda precisa ser testado no navegador/Preview. Não declarar deploy ou teste visual como concluído.
## Primeira entrega da nova experiência autenticada (24/11/2026)

- Criados `inicio.html`, `css/dashboard.css`, `js/dashboard.js` e a API protegida `functions/api/company-dashboard.js` na branch DEV.
- O dashboard autentica a sessão, valida o vínculo ativo no servidor e diferencia administrador de participante.
- Administrador recebe nome da empresa, avaliações, situação da triagem, quantidade de respostas registradas por módulo, status, responsável, última pessoa que atualizou e resumo da equipe. Membro recebe somente avaliações/módulos atribuídos ao próprio usuário, com pendências e progresso pessoal.
- O dashboard não entrega respostas textuais do questionário: somente contagens e metadados necessários ao painel. A API filtra os módulos do participante no servidor.
- Cabeçalho principal criado com Início, Minha empresa e Avaliações da empresa, com adaptação para telas estreitas. Menu de conta simplificado para Minha conta, Segurança e Sair.
- Na raiz/index, a sessão autenticada com vínculo ativo é direcionada ao dashboard; usuário autenticado sem vínculo é direcionado à conta; visitante continua vendo a página institucional. Rotas com token/avaliação pública preservam o fluxo próprio.
- A área Minha empresa está inicialmente ligada à seção empresarial já existente em `conta.html#empresa`; ainda falta uma página dedicada e separar visualmente os formulários empresariais da área de conta.
- A tela de avaliações recebeu o cabeçalho principal comum. A tela de conta também recebeu a navegação principal e o menu de conta.
- A primeira versão usa progresso por módulos concluídos e contagem de respostas por módulo; percentual exato por pergunta para todos os bancos dinâmicos (segmento/ramo) ainda precisa de definição e validação.
- Nenhum schema/migração Supabase foi alterado. Nenhuma produção foi modificada. A implementação está somente na branch DEV e ainda precisa de teste no Preview em desktop e celular, para administrador, membro, visitante e usuário sem empresa.
### Ajustes complementares de navegação e estado (24/11/2026)

- A navegação principal foi adicionada também à página de conta e à tela de avaliações, com links para Início, Minha empresa e Avaliações da empresa.
- O menu de conta na landing e nas páginas internas contém apenas Minha conta, Segurança e Sair.
- A âncora Minha empresa e Segurança aguarda a exibição dos dados autenticados antes de rolar para a seção correspondente.
- Arquivos CSS e módulo do menu receberam parâmetros de versão para reduzir risco de conteúdo antigo em cache.
- O botão interno “Menu inicial” da avaliação empresarial continua orientando a retornar ao painel de avaliações; o item Início do cabeçalho agora aponta para o dashboard autenticado.

## Benchmarking externo com fontes públicas e diagnóstico comparativo (24/11/2026)

### Objetivo definido pelo usuário

O relatório executivo do Mapa 360 deverá ir além de apresentar respostas e níveis internos de maturidade. Deve tentar posicionar a empresa avaliada em relação a empresas comparáveis, usando dados e referências públicas verificáveis.

A comparação deverá considerar, sempre que a disponibilidade e a qualidade dos dados permitirem: segmento econômico/atividade; porte da empresa; região geográfica; período de referência; indicadores comparáveis de gestão, operação, produtividade, tecnologia e desempenho.

A finalidade é mostrar à direção onde a empresa está em relação ao contexto externo, quais diferenças merecem atenção, quais oportunidades existem e quais melhorias são prioritárias.

### Fontes públicas a investigar e utilizar

Fontes inicialmente identificadas na conversa:
- IBGE: estatísticas econômicas e industriais, pesquisas estruturais e conjunturais, dados por atividade e porte quando publicados.
- CNI: indicadores e pesquisas industriais, sondagens e referências setoriais.
- Sebrae: estudos e indicadores de pequenos negócios, porte, gestão e ambiente empresarial.
- ABDI: estudos de transformação digital, produtividade, inovação e indústria.
- RAIS e CAGED: dados públicos de emprego, estabelecimentos, ocupações e movimentação do trabalho, respeitando os recortes e limitações de cada base.

A seleção final de indicadores e fontes deverá ocorrer após verificar a existência de dados públicos compatíveis com cada pergunta/indicador do Mapa 360. Não presumir que todas as fontes oferecem cruzamentos simultâneos por segmento, porte e região.

### Regras metodológicas obrigatórias

1. Distinguir claramente referência externa baseada em dados públicos de benchmark interno do Mapa 360, calculado a partir de avaliações próprias e anonimizadas.
2. Não misturar escalas, conceitos ou populações diferentes como se fossem equivalentes.
3. Para cada indicador, registrar fonte, referência/link, ano/período, população pesquisada, metodologia, unidade/escala, abrangência geográfica e limitações.
4. Só comparar indicadores que tenham definição e método suficientemente compatíveis. Quando não houver correspondência, apresentar contexto qualitativo ou declarar que não há base comparável.
5. Começar pela indústria de transformação, com segmentação por atividade e porte; ampliar para outros segmentos conforme a base pública e a qualidade metodológica.
6. Priorizar recortes regionais quando houver amostra/dado representativo. Se o recorte ficar insuficiente, ampliar geografia de forma explícita e informar a mudança.
7. Manter uma base de referências estruturada e atualizável, com histórico das versões e datas de atualização.
8. Não inventar percentis, médias, rankings ou posições. Toda posição relativa deve ter fonte e cálculo reproduzível.
9. Benchmark interno do Mapa 360 deve usar dados anonimizados e agregados; não expor empresas ou respostas individuais. Como regra inicial discutida, exigir pelo menos 10 avaliações comparáveis para divulgar uma referência agregada, além de avaliar risco de reidentificação e LGPD.
10. Quando não houver dados suficientes, apresentar a limitação em vez de fabricar uma comparação.

### Inteligência de recomendações — relatório mais incisivo

O relatório deverá relacionar evidências da avaliação com:
- situação observada e resposta que sustenta a conclusão;
- consequência gerencial/operacional provável, sem afirmar causalidade não comprovada;
- referência externa aplicável, quando existir;
- prioridade e justificativa;
- recomendação prática, método ou abordagem possível (por exemplo Lean, Kanban, Scrum ou outras ferramentas), somente quando adequada ao problema;
- resultado esperado e indicador para acompanhar a melhoria.

As recomendações devem explicar o que melhorar, por que melhorar e como começar. Evitar frases genéricas. Métodos como Lean, Kanban e Scrum não devem ser sugeridos automaticamente: a escolha depende da natureza do problema e do contexto da empresa.

### Estrutura pretendida do relatório

1. Síntese executiva e posicionamento da empresa.
2. Perfil da empresa e recorte de comparação utilizado.
3. Diagnóstico interno por dimensão/módulo.
4. Comparação com referências públicas, com fonte, período, método e limitações.
5. Benchmark Mapa 360 anonimizado, somente quando houver amostra suficiente.
6. Pontos fortes, lacunas e riscos prioritários, fundamentados nas respostas.
7. Recomendações específicas, motivo, método sugerido e resultado esperado.
8. Plano de evolução por horizonte (curto, médio e longo prazo), com responsáveis e indicadores.
9. Fontes, metodologia, notas e limitações.

### Fases de implementação

1. Mapear perguntas e indicadores atuais do questionário para dimensões mensuráveis.
2. Inventariar bases públicas e confirmar quais variáveis realmente permitem comparação por atividade, porte e região.
3. Definir metodologia e indicadores-piloto para indústria de transformação.
4. Construir a base de referências externas, preservando metadados, fontes e periodicidade.
5. Desenvolver regras de análise e recomendações fundamentadas.
6. Integrar os resultados ao relatório executivo e à exportação PDF.
7. Em fase posterior, adicionar benchmark interno anonimizado do Mapa 360, com controle de amostra mínima e proteção contra reidentificação.

### Situação

Esta seção registra a decisão metodológica e o escopo desejado; não significa que as fontes já foram coletadas, integradas ou que o benchmarking esteja implementado. A automação de dados públicos, a base comparativa e a geração das recomendações continuam pendentes. O relatório deverá distinguir dados observados, referências externas, inferências e recomendações.

## Gestão de participantes — melhoria de layout desktop e mobile (24/11/2026)

### Problema observado pelo usuário

Na tela de gerenciamento de participantes, em computador, o conteúdo está limitado a uma coluna estreita e centralizada, com aparência de layout mobile ampliado. A tabela exige rolagem horizontal, prejudicando a leitura e o uso em telas desktop.

### Requisitos de melhoria

- Desktop: ampliar a área útil da página e utilizar melhor a largura disponível, sem manter o formulário/tabela estreitos como um cartão de celular centralizado.
- Desktop: reorganizar colunas, espaçamentos e ações para que a tabela caiba na largura disponível sempre que possível, eliminando a rolagem horizontal como comportamento normal.
- Mobile: criar/validar uma apresentação própria e responsiva para participantes. Em telas estreitas, preferir cartões ou linhas empilhadas com nome, e-mail, papel, situação e ações claramente acessíveis, em vez de comprimir todas as colunas numa tabela larga.
- Tablet: comportamento intermediário, preservando legibilidade e acesso às ações.
- Manter todas as funcionalidades existentes (convites, papel, bloqueio/desbloqueio, redefinição de senha, edição e remoção) e as regras de autorização.
- Não duplicar lógica de negócio nem criar telas paralelas desnecessárias: compartilhar dados e ações, variando a apresentação conforme a largura da tela.
- Garantir acessibilidade, alvos de toque adequados e ausência de rolagem horizontal da página.

### Situação e pendência

O usuário informou que não sabe se a tela mobile dedicada já foi criada. A inspeção de implementação ainda não foi feita nesta etapa; portanto, não declarar a versão mobile como existente ou concluída. Próxima tarefa: inspecionar conta.html, CSS e JavaScript da gestão de participantes, confirmar o comportamento atual em desktop e mobile e implementar o ajuste responsivo de forma modular, preservando as ações existentes.


## Gate obrigatório antes da promoção DEV → produção: comparação de segurança (24/11/2026)

Antes de promover a versão DEV para produção, executar uma comparação explícita entre as configurações e controles de segurança existentes no ambiente de produção e os existentes na DEV. O objetivo é identificar controles já ativos em produção que ainda não foram reproduzidos na DEV e incorporá-los antes da promoção, quando forem aplicáveis e compatíveis com a arquitetura atual.

### Escopo mínimo da comparação

1. **Cloudflare Pages/Functions**
   - Variáveis de ambiente e secrets por ambiente, sem copiar valores secretos para logs ou documentação.
   - Regras de cache e no-store para páginas autenticadas, APIs e fluxos de recuperação de senha.
   - Headers de segurança (CSP, HSTS, X-Content-Type-Options, Referrer-Policy, Permissions-Policy e proteção contra framing), verificando diferenças e compatibilidade.
   - Regras de roteamento, middleware, rate limiting, proteção contra abuso/bots e configuração de domínios/redirects.
   - Separação estrita de endpoints e credenciais DEV/produção; nunca permitir fallback da DEV para o banco de produção.

2. **Supabase**
   - RLS habilitado em todas as tabelas com dados sensíveis e revisão de policies.
   - Grants e privilégios para anon, authenticated e service_role; funções/RPCs, SECURITY DEFINER, search_path e permissões EXECUTE.
   - Auth: confirmação de e-mail, recuperação de senha, políticas de senha, proteção contra senhas vazadas, expiração/rotação de sessões e URLs de redirect.
   - Configuração de CORS, URLs autorizadas, CAPTCHA/Turnstile quando aplicável, rate limits e proteção contra abuso.
   - Extensões, triggers, funções de evento, backups e PITR, quando disponíveis.
   - Chaves e segredos: uso exclusivo no servidor para service role; nenhuma chave privilegiada no navegador.

3. **Aplicação e APIs**
   - Autorização por empresa e por papel em todas as rotas; isolamento entre empresas (IDOR/BOLA).
   - Bloqueio imediato de membros desativados, inclusive com sessão antiga.
   - Proteção CSRF quando aplicável, validação de origem, XSS, injeção, validação de entrada e limites de payload.
   - Rate limiting para login, convites, recuperação de senha e operações sensíveis.
   - Logs/auditoria sem tokens, senhas, e-mails desnecessários ou conteúdo sensível das respostas.
   - Controle de concorrência e proteção contra sobrescrita de respostas.
   - Dependências, vulnerabilidades conhecidas e exposição de arquivos/configurações.

4. **Operação e recuperação**
   - Confirmar backups/restauração e plano de rollback de código e banco.
   - Verificar alertas, logs e monitoramento disponíveis.
   - Confirmar que migrações de produção são aditivas, revisadas e compatíveis com dados existentes.
   - Testar fluxos críticos com contas de teste em ambiente isolado, sem expor dados reais.

### Método e restrições

- Primeiro consultar e registrar o estado atual da branch DEV e do ambiente DEV.
- Consultar as configurações de produção somente para leitura durante a auditoria. Não alterar produção durante a comparação.
- Comparar controles equivalentes, registrando: controle, estado em produção, estado em DEV, diferença, risco, ação recomendada e evidência/data.
- Não copiar cegamente configurações que dependam de domínio, URL, chaves, remetente ou infraestrutura específica de produção; adaptar os valores ao ambiente DEV.
- Nunca copiar secrets entre ambientes nem colocar valores secretos na documentação. Registrar apenas nomes das variáveis e se estão configuradas.
- Não enfraquecer produção para igualá-la à DEV. A referência é preservar ou melhorar a segurança, adaptando o que for necessário.
- Se um controle não puder ser reproduzido na DEV por limitação técnica ou de plano, documentar a exceção e o risco antes da decisão de release.
- Não executar alterações destrutivas, reset de banco, remoção de usuários ou migrações não aprovadas.
- Não promover nem publicar em produção sem autorização explícita do usuário.

### Critério de liberação

A promoção só poderá ser recomendada depois de:
1. inventário comparativo concluído e documentado;
2. diferenças de segurança relevantes corrigidas na DEV;
3. testes de regressão e isolamento aprovados;
4. migrações revisadas e plano de rollback definido;
5. usuário revisar e autorizar expressamente a promoção.

### Estado

Esta etapa foi solicitada pelo usuário e está registrada como gate obrigatório de release. A comparação real entre produção e DEV ainda não foi executada. Deve ocorrer depois das implementações funcionais e antes de qualquer promoção.


## Ajuste da gestão de participantes para desktop e mobile (24/11/2026)

- A área autenticada da página de conta passa a utilizar largura de trabalho ampliada, sem alterar a largura compacta das telas de login/cadastro.
- A listagem de participantes deixa de depender de tabela com largura mínima fixa e rolagem horizontal; passa a usar cartões semânticos em grade responsiva.
- Em desktop, os cartões são organizados em duas colunas; em tablet e celular, ficam empilhados em uma coluna. Em telas muito estreitas, as ações também passam para uma coluna.
- Cada cartão apresenta nome, e-mail, perfil, situação e ações administrativas; os botões mantêm alvos de toque maiores no celular.
- A lógica de carregamento, autorização e execução das ações permanece centralizada no JavaScript/API existente. Não foram criadas rotas novas nem alteradas permissões de backend.
- A alteração foi feita somente na branch DEV. A validação visual e funcional no Preview em desktop, tablet e celular ainda precisa ser realizada pelo usuário; não declarar deploy ou teste de navegador concluído.


## Consolidação de identidade visual, desempenho, cadastro empresarial e fases (24/11/2026)

### Identidade visual e navegação
- Criado `css/workspace-theme.css` como camada compartilhada para as páginas autenticadas: Início, Minha empresa/conta, Avaliações da empresa e instrumento de avaliação.
- A folha compartilhada padroniza família tipográfica, paleta azul-marinho/azul-petróleo, cabeçalhos, marca, navegação principal, estados ativos e menu de conta. É carregada depois das folhas específicas de cada página para reduzir divergências.
- As folhas locais continuam responsáveis pela estrutura e componentes específicos de cada página; a camada comum não substitui o CSS funcional de cada tela.
- Foram acrescentados estilos para as quatro fases, estado atual/concluído/próximo, campo de nome empresarial somente leitura no questionário e rótulos percentuais de progresso.
- Páginas atualizadas: `index.html`, `inicio.html`, `conta.html` e `company-assessments.html`.

### Cadastro automático e nome oficial da empresa
- O cadastro inicial continua coletando o nome da empresa e agora grava também o marcador `company_setup_pending` nos metadados de cadastro. Esse metadado é apenas um dado de entrada; não é usado para autorização.
- Após a conta obter uma sessão autenticada e o e-mail estar confirmado, `js/conta.js` consulta o vínculo empresarial. Se não houver vínculo e existir nome de empresa pendente, chama `POST /api/create-company` para criar o registro e o vínculo de administrador automaticamente.
- O fluxo não tenta criar empresa durante convite; contas convidadas continuam vinculadas exclusivamente pelo aceite do convite.
- O fluxo é idempotente na prática: em conflito de vínculo já existente, consulta novamente `/api/my-company` em vez de criar outro registro.
- Após criação automática, o marcador pendente é atualizado para falso. O guia inicial do administrador continua sendo aberto quando o cadastro veio por `entrada=admin`.
- A rota `GET /api/my-company` continua sendo a fonte oficial do nome da empresa. Foi ampliada para aceitar `PATCH`, limitado a administrador ativo, com validação de tamanho, normalização de espaços, limite de frequência e resposta de conflito para nome duplicado.
- Em “Minha empresa”, somente o administrador recebe o formulário de edição do nome. O questionário empresarial apresenta o nome oficial como somente leitura; o endpoint de carregamento da avaliação também retorna o nome do registro empresarial, não o nome de metadados do usuário.
- Nenhuma alteração de schema ou migração Supabase foi necessária nesta etapa.

### Fases como fluxo real de trabalho
- Os cards deixaram de ser opções de seleção livre no questionário e passaram a mostrar o progresso sequencial: Triagem inicial, Diagnóstico consultivo, Plano de melhoria e Acompanhamento.
- O avanço é exclusivo do administrador e é registrado em `m360_assessments.shared_payload.stage`, com evento em `m360_assessment_events`.
- A API `POST /api/company-assessment-module` recebeu a ação `advance_stage`, com validação da sequência e controle de concorrência por `updated_at`.
- Critérios de avanço:
  1. Triagem → Diagnóstico: triagem geral concluída e registro de conclusão presente.
  2. Diagnóstico → Plano: ao menos uma resposta com evidência marcada como verificada.
  3. Plano → Acompanhamento: ao menos uma oportunidade com status Aprovada, Em execução ou Concluída.
- Os campos `stage`, `triage_completed_at` e `triage_completed_by` foram protegidos contra alteração pelo autosalvamento genérico. A conclusão da triagem e o avanço de fase usam suas ações próprias.
- O autosalvamento preserva os campos de fluxo confirmados pelo servidor. Antes de avançar a fase, alterações pendentes são enviadas e confirmadas.
- O status técnico da avaliação (`draft`, `in_progress`, `completed`, etc.) continua separado da fase consultiva.

### Desempenho e percentual de progresso
- A abertura da página de conta não aguarda mais o carregamento da lista de participantes; a lista é carregada em segundo plano, evitando manter a tela inicial presa no percentual de 75%.
- Eventos de sessão inicial e renovação de token deixaram de disparar consultas empresariais completas; a inicialização principal trata a sessão e os eventos de autenticação relevantes.
- Consultas simultâneas de estado empresarial são deduplicadas enquanto estão em andamento.
- O salvamento dos módulos da avaliação empresarial passou a executar atualizações independentes em paralelo, preservando o controle de versão individual de cada módulo.
- Removida uma segunda renderização integral da avaliação empresarial na inicialização.
- O percentual do dashboard continua significando **módulos concluídos ÷ módulos selecionados/atribuídos**, não perguntas respondidas. A tela de avaliações passou a mostrar o número percentual, a contagem de módulos e atributos acessíveis do indicador visual.
- O percentual de 75% corresponde a três de quatro módulos concluídos, quando esse for o total selecionado/atribuído. A cobertura de respostas da triagem permanece como indicador separado.

### Arquivos e rotas envolvidos
- CSS: `css/workspace-theme.css`, `css/styles.css`, `css/conta.css`.
- HTML: `index.html`, `inicio.html`, `conta.html`, `company-assessments.html`.
- JavaScript: `js/app.js`, `js/conta.js`, `js/company-assessment-adapter.js`, `js/company-assessments-page.js`.
- APIs: `functions/api/my-company.js`, `functions/api/company-assessment-module.js`.
- Nenhuma alteração em produção; nenhuma migração ou alteração direta no banco foi executada.

### Validação pendente
- Não foi possível executar teste visual em navegador nesta etapa. A implementação está somente na branch DEV e precisa ser conferida no Preview em desktop e celular.
- Testes manuais obrigatórios:
  1. Criar conta nova por `entrada=admin`, confirmar e-mail, autenticar e verificar criação automática da empresa sem pedir o nome novamente.
  2. Confirmar que conta convidada aceita convite e não cria empresa própria.
  3. Alterar o nome em Minha empresa como administrador; confirmar que membro não vê o formulário e que o nome atualizado aparece no dashboard e em avaliações reabertas.
  4. Concluir triagem, tentar avançar sem evidência verificada, marcar evidência como verificada e avançar para Plano.
  5. Tentar avançar para Acompanhamento sem ação aprovada; aprovar uma oportunidade e avançar.
  6. Conferir que o autosalvamento não reverte a fase nem a conclusão da triagem.
  7. Conferir consistência de cabeçalho, fontes, cores e navegação entre Início, Minha empresa, Avaliações e questionário.
  8. Conferir o carregamento da tela e do percentual em avaliações com 4 módulos (75%), 2 módulos (50%) e 1 módulo (100% quando concluído), além de conta com muitos participantes.
  9. Testar botões, salvamento, convites, edição de participantes e sessões admin/membro.
- Preview correto informado para a branch DEV: https://feature-1-2-0-contas-usuario.mapa360.pages.dev/
- A validação acima continua pendente; não declarar deploy, teste de navegador ou aceite funcional concluído.
- HEAD da branch DEV no momento do registro desta seção: `e2e1af96ba6f953ed551166ca291a85f780fafef`. A documentação foi atualizada depois desse commit; consultar o HEAD atual antes da próxima alteração.


### Complemento — visibilidade das fases e verificação de repositório
- A fase atual também é apresentada nos cartões do dashboard e na lista “Avaliações da empresa”, para que administrador e membros reconheçam em que etapa o trabalho está.
- A API do dashboard retorna apenas o identificador da fase, sem expor o conteúdo completo de `shared_payload` aos participantes.
- Verificação do repositório antes desta atualização documental: branch DEV `feature/1.2.0-contas-usuarios`, código em `320cf1bc8b7ffe5f6122ece1551f08cda4e72c24`.
- Não foram encontrados workflows de CI associados ao commit consultado nem status checks publicados. A revisão estática dos arquivos foi feita por leitura; compilação/testes automatizados e teste em navegador ainda não foram executados.


## Ajustes de navegação, menu de conta e carregamento progressivo (24/11/2026)

### Cabeçalho do instrumento de avaliação
- Removida a aba/botão “Avaliação” do cabeçalho do instrumento em `index.html`. O próprio conteúdo da avaliação já é a tela aberta; a aba duplicava a navegação sem oferecer mudança real de seção.
- Mantida a aba “Referências e benchmarks”, como ferramenta complementar acessível durante a avaliação.
- A seção do instrumento passou a ser identificada como região de conteúdo, não como uma aba controlada por botão removido.
- A navegação principal do espaço empresarial permanece: Início, Minha empresa e Avaliações da empresa.

### Botão de conta
- O botão do menu agora usa fundo branco e texto preto, com largura mínima e espaçamento fixo para impedir que “Conta” fique encoberto.
- O avatar exibe duas iniciais quando há nome e sobrenome; para nome de uma palavra, exibe até duas letras.
- O rótulo “Conta” permanece visível também em telas estreitas. Avatar, rótulo e seta não podem encolher ou sobrepor uns aos outros.
- A folha `css/account-menu.css` foi carregada também em `conta.html`, evitando que Minha empresa use uma apresentação diferente.

### Carregamento progressivo padronizado
- O dashboard `inicio.html` recebeu barra, percentual numérico e mensagens de etapa; `js/dashboard.js` atualiza o progresso nos marcos de configuração, sessão, consulta do painel, organização dos dados e finalização.
- A página de avaliações usa marcos próprios: início, validação da sessão, consulta de avaliações, participantes/responsáveis, organização e finalização.
- A página de conta mantém as etapas de autenticação e agora apresenta etapa explícita de finalização antes de concluir o carregamento.
- O instrumento de avaliação apresenta marcos de preparação, leitura da avaliação empresarial, montagem da tela e finalização.
- As barras compartilham transição e estilo visual pela folha `css/workspace-theme.css`. O percentual é um indicador de etapas efetivamente concluídas no carregamento, não uma estimativa de tempo restante; pode avançar em saltos conforme cada operação termina.
- Atualizados parâmetros de versão dos arquivos CSS e JS alterados para evitar que o navegador continue usando versões antigas em cache.

### Arquivos alterados nesta rodada
- `index.html`, `inicio.html`, `conta.html`, `company-assessments.html`.
- `css/account-menu.css`, `css/workspace-theme.css`.
- `js/account-menu.js`, `js/dashboard.js`, `js/company-assessments-page.js`, `js/conta.js`, `js/app.js`.

### Validação
- Confirmada por leitura do repositório a remoção do elemento `tab-assessment`, a permanência de “Referências e benchmarks”, os elementos de percentual nas quatro telas e os marcos progressivos correspondentes.
- Corrigida a separação das iniciais para considerar corretamente espaços entre nomes.
- Ainda não houve execução em navegador nem teste visual desktop/mobile. É necessário validar o Preview DEV, especialmente o alinhamento do menu em largura móvel e a sequência dos percentuais durante carregamento lento.
- Nenhum dado, configuração ou código de produção foi alterado.


## Distribuição horizontal do cabeçalho e situação do relatório executivo (24/11/2026)

### Cabeçalho do instrumento
- Ajustado `css/styles.css` para distribuir horizontalmente, em desktop, a marca, navegação do espaço empresarial (Início, Minha empresa, Avaliações da empresa), acesso complementar “Referências e benchmarks” e menu de conta.
- A navegação principal e a aba complementar deixam de competir por uma única largura flexível; cada grupo tem dimensionamento próprio, espaçamento e rolagem horizontal controlada quando necessário.
- Em telas menores, a navegação se reorganiza em linhas próprias, preservando o menu de conta e evitando sobreposição ou corte do texto.
- Atualizada a versão de cache de `styles.css` em `index.html`.
- Alteração restrita ao instrumento em `index.html`; não modifica as demais páginas.

### Situação atual do relatório executivo — diagnóstico técnico
- O instrumento já possui geração de documento em HTML e impressão em PDF A4 pelo navegador, com capa, natureza do documento, perfil da empresa, visão de maturidade, alertas/evidências, médias por grupo, seção de comparativo, próximos passos, metodologia e anexo opcional de respostas.
- Já existem níveis declarados e validados por evidência, cobertura, alertas críticos e classificação do tipo de resultado (triagem ou diagnóstico consultivo com validação parcial/validada).
- O relatório possui recomendações automáticas, mas ainda precisam ser avaliadas e aprimoradas para garantir rastreabilidade explícita entre achado, evidência, impacto, prioridade, ação, responsável, prazo e indicador.
- O relatório ainda declara benchmarking comparativo em formação. Não calcula posição da empresa frente a pares reais por porte, segmento e região.
- A base de referências externas no instrumento é separada da nota interna e só apresenta registros marcados como verificados, com unidade/escala e dados de fonte. Essa base não equivale a um benchmark comparável: não há ainda ingestão atualizável validada, cobertura sistemática de indicadores públicos, nem metodologia de normalização por porte/segmento/região.
- O benchmark interno Mapa 360 anonimizado, com regra mínima de 10 avaliações comparáveis, ainda não foi implementado.
- O relatório empresarial consolidado é produzido ao concluir a avaliação e armazenado em `final_payload`; porém a interface atual de relatório está principalmente dentro do instrumento. Ainda falta confirmar e desenvolver a consulta/reabertura do relatório consolidado a partir do dashboard/lista de avaliações, com regras claras para admin e membro.
- A conclusão atual exige módulos atribuídos concluídos e consolida respostas; não há ainda uma etapa própria de revisão/aprovação editorial do relatório antes da emissão.
- O PDF atual usa a janela de impressão do navegador e “Salvar como PDF”; não é geração de arquivo PDF no servidor com controle de versão, assinatura ou armazenamento de artefato.

### Próximas entregas recomendadas para o relatório
1. **Contrato e dados consolidados:** definir um modelo versionado de relatório, separar dados de entrada, métricas calculadas, achados, recomendações, benchmarks e metadados de emissão; garantir que o relatório reaberto use o snapshot concluído e não respostas mutáveis.
2. **Rastreabilidade do diagnóstico:** cada achado deve apontar perguntas, respostas, evidências, estado de validação, dimensão, consequência gerencial provável (sem causalidade presumida), confiança e prioridade.
3. **Plano de ação integrado:** consolidar problema, causa/hipótese, impacto, ação recomendada, método adequado, responsável, prazo, linha de base, meta, indicador, dependências e status; permitir revisar antes de emitir.
4. **Comparabilidade externa:** mapear perguntas/indicadores do instrumento e validar variáveis públicas disponíveis em IBGE, CNI, Sebrae, ABDI e RAIS/CAGED; registrar fonte, URL, período, população, metodologia, unidade, geografia, porte, segmento e limitações. Começar pela indústria de transformação. Não comparar escalas incompatíveis.
5. **Benchmark interno:** somente após base suficiente, agregação e anonimização; regra mínima inicial de 10 empresas por grupo comparável e avaliação de risco de reidentificação/LGPD.
6. **Apresentação executiva:** síntese incisiva, perfil e recorte comparativo, pontos fortes/lacunas/riscos, comparação externa quando válida, recomendações específicas, plano de curto/médio/longo prazo, indicadores e metodologia/limitações.
7. **Emissão e histórico:** gerar PDF com layout profissional, versão do instrumento/metodologia, data de emissão, status (triagem ou diagnóstico validado), identificação da avaliação e histórico de versões; oferecer consulta/download na área da empresa.
8. **Validação:** testar consistência de cálculos, casos com respostas incompletas, módulos diferentes, ausência de benchmarks, validação parcial/total, permissões admin/membro, exportação A4 e reabertura de avaliações concluídas.

### Ordem de execução acordada
- Primeiro estabilizar identidade visual, navegação e desempenho.
- Depois mapear perguntas/indicadores atuais do instrumento.
- Em seguida inventariar e validar bases públicas e a metodologia-piloto para indústria de transformação.
- Então desenvolver análise/recomendações, relatório executivo e emissão.
- Por último, implementar benchmark interno anonimizado.
- Não inventar médias, percentis, posições de mercado ou relações causais. Quando não houver amostra ou variável comparável, o relatório deve declarar a limitação.
- O trabalho acima é diagnóstico e plano de evolução; nesta rodada foi ajustado o cabeçalho, mas o relatório ainda não foi alterado.


## Cópia de avaliações e linhagem (24/11/2026)

- Decisão funcional: administrador pode usar “Copiar avaliação” no painel para criar uma nova avaliação independente, em aberto, mantendo referência à avaliação de origem.
- Migração DEV `assessment_copy_lineage`: adiciona `source_assessment_id` com FK composta para a mesma empresa; preserva a avaliação original e impede exclusão da origem enquanto houver cópia.
- A função transacional `clone_m360_company_assessment` cria a avaliação e módulos em uma única transação, registra evento imutável `assessment_copied`, copia contexto e respostas como ponto de partida, reinicia o status dos módulos e não copia `final_payload`, conclusão ou aprovações.
- Responsáveis são mantidos somente quando ainda são membros ativos da mesma empresa; caso contrário, módulo fica sem responsável.
- Respostas copiadas são conteúdo herdado e não devem ser consideradas evidência recém-validada na nova avaliação. A interface informa que precisam ser revisadas.
- API `POST /api/company-assessments` aceita ação `copy`, exige sessão válida e papel admin e chama RPC transacional. A listagem expõe somente o ID de origem, sem conteúdo adicional.
- UI apresenta botão “Copiar avaliação” no cartão do painel do administrador e solicita o novo título.
- Esta funcionalidade foi implementada somente no código/banco DEV. Testes autenticados no Preview ainda são necessários para confirmar comportamento, permissões, integridade de respostas e responsáveis.


## Diretrizes aprovadas para relatório e plano de melhoria (24/11/2026)

Decisões confirmadas pelo usuário:
- Público do relatório: ambos os públicos. Um único documento terá resumo executivo para diretoria/empresários e detalhamento técnico para consultores/gestores.
- Plano de melhoria: integrado ao relatório, com 5W2H, cronograma Gantt e acompanhamento de indicadores.
- Aprovação: construção e aprovação conjuntas pelo administrador da empresa e consultor associado à avaliação com permissão autenticada específica. O registro como participante, isoladamente, não concede permissão.
- Ciclo de gestão: diagnóstico → justificativa para mudança → plano de melhoria → execução → acompanhamento de resultados.

### Sequência acordada
1. Mapear perguntas, respostas, dimensões e evidências do instrumento atual.
2. Definir modelo rastreável de achados, problemas, impactos, recomendações, indicadores e linha de base.
3. Desenvolver relatório executivo/técnico e sua emissão versionada.
4. Integrar 5W2H às recomendações e permitir construção conjunta.
5. Implementar aprovação dupla com trilha de auditoria e versionamento de ações.
6. Gerar Gantt a partir das ações aprovadas.
7. Implementar acompanhamento, metas e comparação realizado x planejado.
8. Incorporar benchmark público validado e, posteriormente, benchmark interno anonimizado.

### Regras de qualidade
- Diferenciar declaração, fato, evidência validada, hipótese, risco provável e estimativa.
- Toda recomendação deve apontar o achado que a originou.
- Metas e impactos não serão inventados; precisam ser definidos ou sustentados por dados.
- Benchmark sem comparabilidade será apresentado como referência contextual, nunca como posição de mercado.
- Relatório emitido é um snapshot versionado, independente de edições posteriores da avaliação.

### Situação
As decisões foram documentadas. O mapeamento completo do instrumento e o novo relatório/plano de melhoria ainda não foram implementados; são as próximas etapas de desenvolvimento.


## Auditoria comparativa de segurança e preparação para consolidação dos bancos (23/11/2026)

### Escopo e limites desta rodada
- Revisão read-only das conexões GitHub e Supabase disponíveis. Nenhum SQL foi executado para alterar dados ou estrutura; nenhum usuário, convite, avaliação ou configuração foi apagado.
- Branch DEV consultada: `feature/1.2.0-contas-usuarios`. Referência atual observada: commit `04385b2591f4fed817f2c88494600f04712bac37` (árvore `e7fdd464e9a722977fc73b8efdb3ef90984fc77c`).
- Branch `main` observada em `7c04677c1af82297dbf3c551ef9f99edc5c453da`.
- A proteção de branch está desabilitada nas duas branches consultadas; verificações obrigatórias também estão desligadas.
- A conexão disponível não permite alterar configurações de proteção do GitHub, configurações de Auth do Supabase nem regras do painel Cloudflare. Essas mudanças não foram simuladas nem declaradas como concluídas.

### Comparação dos bancos observada
- DEV: projeto Supabase `mapa360-dev`, ref `adelbfwfyferfqudhuka`, região `us-east-2`, PostgreSQL 17.12, ativo.
- Produção/base antiga: projeto Supabase `Mapeamento360`, ref `cbkvcpaxebajhmhgmnoq`, região `us-west-2`, PostgreSQL 17.12, ativo.
- DEV possui 12 tabelas públicas do Mapa 360, 9 contas Auth, 4 empresas, 6 vínculos de membros, 4 convites empresariais, 3 avaliações empresariais, 8 módulos e 10 eventos. Também mantém 4 convites legados e 2 submissões.
- O banco antigo possui apenas 4 tabelas públicas legadas (`m360_invitations`, `m360_submissions`, `m360_drafts`, `m360_rate_limits`), 0 usuários Auth, 4 convites, 2 submissões e 4 rascunhos. Não possui as tabelas empresariais e de avaliação modular existentes em DEV.
- DEV registra seis migrações da arquitetura empresarial; a listagem de migrações do banco antigo está vazia.
- Portanto, os bancos não são equivalentes. Não executar sincronização cega, cópia integral de Auth ou migração destrutiva. A consolidação deve preservar os registros legados e os dados empresariais DEV, com reconciliação explícita de IDs, convites, submissões e relações.
- Estratégia recomendada para avaliação: preparar um terceiro banco consolidado como candidato principal, aplicar nele migrações versionadas e importar os dados de DEV e do banco legado por lotes auditáveis. A decisão final depende de backup/exportação verificável, análise de duplicidades e teste de restauração. Até lá, manter os dois bancos intactos.

### Achados confirmados por código/configuração consultados
1. **Autenticação administrativa compartilhada — risco alto:** `functions/api/_shared.js` valida um único `ADMIN_API_TOKEN` por comparação de bearer token. Não representa identidade individual, MFA, atribuição de permissões nem trilha individual. `admin-manage-member.js` usa esse mecanismo e não chama `sameOrigin` explicitamente.
2. **Validação de respostas — risco alto:** em `company-assessment-module.js`, a ação `save` verifica objeto JSON, status permitido, atribuição e concorrência por `updated_at`, mas não valida no servidor o conjunto canônico de perguntas, tipos, limites, valores permitidos e completude por módulo antes de aceitar `completed`.
3. **Auditoria de respostas — lacuna confirmada:** a tabela de eventos registra operações de configuração e etapas, mas o caminho `save` não registra o diff das respostas anterior/novo nem evento equivalente de alteração. A trilha não permite reconstruir integralmente cada edição de resposta.
4. **RLS sem policies — achado INFO com contexto:** as tabelas públicas consultadas têm RLS ativo e nenhuma policy. Os scripts documentam acesso exclusivo via Cloudflare Functions usando service role, com revogação de grants para `anon` e `authenticated`. Isso é compatível com o desenho atual, mas torna a autorização de cada endpoint e RPC privilegiado uma fronteira crítica. Não criar policies genéricas sem redesenhar o modelo.
5. **Proteção contra senhas vazadas:** o Advisor do Supabase DEV reporta `auth_leaked_password_protection` desativado (WARN). No projeto antigo não foi retornado esse aviso; isso não prova que o controle esteja ligado.
6. **Funções SECURITY DEFINER:** DEV contém funções privilegiadas para rate limit, gestão de membros, criação de empresa, convites, conclusão, verificação e cópia. É necessário revisar corpo, EXECUTE grants, identidade do chamador, validações internas e `search_path` individualmente antes de liberar consolidação.
7. **Limitação de branch no endpoint:** `company-assessment-module.js` e `admin-manage-member.js` retornam 404 fora da branch DEV. Isso é um bloqueio deliberado de escopo atual e precisa ser removido ou substituído por configuração de ambiente controlada quando a arquitetura empresarial for promovida; não remover isoladamente antes de preparar schema e secrets do destino.
8. **Turnstile e rate limit público:** o início de avaliação pública aplica limite por IP de 5 tentativas/900s e valida Turnstile no servidor. O envio limita 5 tentativas/900s por hash de token. A allowlist de hostname do código consultado não contém o hostname atual do Preview `feature-1-2-0-conta-usuario.mapa360.pages.dev`; confirmar e corrigir a lista antes do teste público nesse Preview.
9. **Headers e cache:** middleware define CSP, HSTS em HTTPS, anti-frame, nosniff, Referrer-Policy e no-store em rotas selecionadas. Ainda falta teste real dos headers no domínio Preview e revisão da CSP com os scripts efetivamente carregados.
10. **Produção:** a branch `main` consultada não está protegida e o banco Supabase associado à produção disponível é estruturalmente legado. Não foi alterado nenhum recurso de produção.

### Plano seguro de consolidação (ainda não executado)
1. Congelar alterações de schema não versionadas e inventariar todos os dados e dependências nos dois bancos.
2. Fazer backups/exportações completos e validar restauração isolada antes de qualquer migração.
3. Comparar usuários Auth, e-mails, IDs, empresas, convites, avaliações, submissões, rascunhos, eventos e tokens; não copiar hashes/tokens ativos entre ambientes sem política explícita.
4. Criar terceiro projeto como candidato, aplicar migrações versionadas desde uma baseline limpa e manter DEV/legado somente leitura durante a carga.
5. Importar dados por tabelas de staging com mapeamento de IDs e relatório de conflitos; validar contagens, FKs, unicidade, permissões e integridade dos payloads.
6. Testar login/recuperação, convites, isolamento entre empresas, acesso por módulo, conclusão, cópia, trilha de auditoria, rate limit e restauração.
7. Trocar secrets e URLs de forma coordenada no ambiente de Preview; depois planejar janela de migração e rollback da produção.
8. Só apontar produção para o banco consolidado após aprovação dos testes e conferência do usuário. Manter snapshots/backups dos bancos originais pelo período de retenção definido.

### Ações pendentes que dependem de acesso adicional
- GitHub: habilitar proteção/ruleset em DEV e main, exigir PR e checks de CI.
- Supabase: ativar proteção contra senhas vazadas em DEV e produção; revisar MFA de administradores, política de senha, expiração de sessão e backups/restauração.
- Cloudflare: conferir regras WAF, rate limiting, Turnstile, secrets, hostnames e headers nos ambientes Preview e Production.
- Código: substituir token administrativo compartilhado por identidade individual com MFA/RBAC; validar respostas por schema canônico no backend; registrar alterações de respostas; auditar todas as RPCs SECURITY DEFINER e rotas de administração.
- Testes: ainda não foi realizado pentest, teste E2E em navegador, teste de isolamento entre duas empresas nem simulação de abuso. A auditoria desta rodada é estática e baseada nas conexões disponíveis.


## Atualização de segurança — 24/11/2026

Foram aplicadas correções na branch DEV e na branch main, e migrações SQL nos bancos DEV e produção. O detalhamento de arquivos, commits, migrações, verificações e pendências está em `SECURITY-BASELINE.md`, seção 7.

Pontos principais:
- DEV: salvamento de módulo agora é transacional, confirma vínculo/atribuição/empresa/concorrência e grava evento de auditoria na mesma transação, com hashes SHA-256 e chaves alteradas.
- Produção: endpoints de convite, progresso, envio e consulta administrativa receberam validação de origem, limites de requisições, limites de payload e/ou escape HTML. Envio final passou a usar RPC transacional já existente.
- Bancos: `search_path` das funções SECURITY DEFINER foi fixado e os ACLs verificados.
- A consolidação dos bancos continua sendo planejada separadamente; estas correções não migraram dados nem unificaram bancos.

Pendências importantes: token administrativo compartilhado, MFA/RBAC, validação semântica e de completude do questionário, proteção contra senhas vazadas no DEV, regras GitHub/Cloudflare e testes E2E/pentest.


### Continuação das correções de segurança — 24/11/2026
Na DEV foram adicionados limites por usuário/IP para módulos, avaliações e gestão de participantes; same-origin e rate limit às rotas administrativas legadas; e validação server-side adicional das respostas e transições de conclusão. O estado detalhado, testes e limitações está no `SECURITY-BASELINE.md`.


## Continuidade — Administrador Global e autenticação forte (24/11/2026)

- A conta informada para o responsável da plataforma foi localizada no Supabase DEV e recebeu o papel global platform_admin. Esse papel é separado dos administradores de empresas e não é derivado de user_metadata nem do primeiro cadastro.
- O modelo de autorização está no schema private, com tabelas de papéis e auditoria. Acesso direto por anon/authenticated é revogado; o backend consulta o papel por RPC com EXECUTE apenas para service_role.
- O painel administrativo DEV foi atualizado para login com a conta individual, senha e segundo fator TOTP (AAL2). A interface não oferece cadastro público de administrador. O acesso deve usar a conta já existente no Mapa 360.
- As seis rotas globais do painel (empresas, avaliações, resultado, gestão de membros, exclusão de avaliação e criação de convite) agora usam validação server-side do usuário autenticado, papel global, AAL2, auditoria e os controles same-origin/rate limit já existentes.
- O token administrativo compartilhado ainda permanece como legado no helper e no ambiente; não remover até busca final de referências e validação do Preview. A produção permanece intocada nesta etapa.
- Verificações feitas: papel global confirmado por SQL; privilégios das RPCs confirmados como service_role-only; sintaxe estática dos arquivos migrados aprovada.
- Ainda pendente: login real, cadastro e validação do autenticador, teste de rotas protegidas, auditoria dos eventos gravados, teste E2E/pentest e confirmação do deploy Preview. Não afirmar que o fluxo está pronto para uso até essas validações.
- Documentação detalhada e limitações: SECURITY-BASELINE.md, complemento de 24/11/2026.


- Continuação da segurança na DEV: corrigido import ausente do rate limiter em company-assessment-members.js; o painel global migrou para conta individual + TOTP/AAL2; e a rota de salvamento agora confere as perguntas dinâmicas de segmento/ramo/produto contra o contexto persistido e impede conclusão incompleta. Os testes da lógica dinâmica foram isolados; a validação funcional com navegador/usuários reais continua pendente. Detalhes em SECURITY-BASELINE.md.

- Último ponto de continuidade desta rodada: branch DEV feature/1.2.0-contas-usuarios, HEAD anterior à atualização deste resumo 1f70e4d67b46f0afbcd3117a5f86d452743b7af9; a atualização de SECURITY-BASELINE.md gerou um commit posterior. O formulário admin não cria conta: utiliza a conta Auth existente, com configuração TOTP no primeiro acesso. Ainda não foi validado em navegador.


## Continuidade da segurança — 24/11/2026

- A branch DEV recebeu correções adicionais no painel de Administrador Global: consulta correta de usuários, validação TOTP, retomada de fatores pendentes e rollback de bloqueios preservando o estado anterior da conta.
- O roteamento dos bancos agora falha fechado: DEV somente em feature/1.2.0-contas-usuarios; produção somente em main; qualquer outra branch não recebe credenciais de banco.
- Reforçados limites de requisição em APIs de convite, painel, participantes, empresa e autoavaliação pública. Corrigido o endpoint de resultado público, removido o endpoint diagnóstico temporário e reduzida a renderização HTML desnecessária.
- Corrigido erro de sintaxe no guia interativo.
- O banco DEV confirmou RLS e ausência de privilégios diretos dos papéis anon/authenticated nas tabelas de aplicação revisadas. As funções privilegiadas de negócio permanecem executáveis somente por service_role.
- A documentação detalhada, incluindo os testes e limitações, está em SECURITY-BASELINE.md.
- Ponto de código após as correções funcionais, antes dos commits de documentação: HEAD 5daf04a1d9b57d026aeaa1aa877764124e8fa986. Os commits de documentação desta rodada vieram depois.
- Pendências imediatas: validação real do login/TOTP no Preview, testes de isolamento entre empresas e APIs, auditoria server-side completa do payload da autoavaliação pública, proteção da branch no GitHub e inspeção de WAF/configurações Cloudflare. Nenhuma dessas verificações foi substituída por testes de sintaxe.
- Nenhuma alteração foi feita na produção.

- Reforço adicional no fluxo público: a API de conclusão remove qualquer autodeclaração de evidência verificada, validação consultiva, aprovação de oportunidade, revisão de pesos ou log local apresentado pelo navegador. Evidências ficam como indicadas, e o registro recebe metadado de submissão pública ainda não validada consultivamente. IDs de respostas fora dos padrões do instrumento são descartados. A conferência completa de perguntas ativas e obrigatoriedade de resposta ainda é pendente.

- Validação de completude implementada no servidor em `functions/api/assessment-submit.js`: reconstrói perguntas ativas conforme módulos, segmento, ramos e produtos declarados; rejeita conclusão com perguntas sem resposta válida; descarta respostas fora do contexto e preserva a regra de que evidência pública não é evidência consultivamente verificada.
- A validação usa os IDs do instrumento 3.2.0 e contempla perguntas gerais, oito bancos de segmento, ramos com perguntas próprias ou genéricas, produtos e módulos PPCP, automação, dados/BI, administrativo e projetos. Módulos desconhecidos e listas/contextos inválidos são rejeitados.
- Testes isolados cobriram todos os segmentos, ramos com perguntas próprias e genéricas, combinação de módulos (89 perguntas no cenário), perguntas faltantes, IDs artificiais e tentativa de falsificar validação. A RPC SQL de conclusão segue executável apenas por service_role.
- A seleção de segmento/ramos/produtos/módulos continua sendo declaração do respondente; a validação técnica assegura consistência e completude da seleção informada, não a veracidade do contexto empresarial. A confirmação factual fica para o diagnóstico consultivo.
- Não houve alteração no banco nesta etapa, nem na produção. O código ainda depende de validação funcional real no Preview/navegador.

- Verificação da conta Administrador Global (DEV): a conta informada já existe, está confirmada e possui `platform_admin` ativo. Ela também possui vínculo empresarial ativo como `member`; não alterar esse papel empresarial automaticamente. Nenhum fator TOTP está cadastrado, portanto o primeiro acesso ao painel global deve configurar o aplicativo autenticador.
- Não é necessário domínio próprio para entrar no painel ou gerar links de convite compartilháveis. O painel global utiliza e-mail/senha existentes e TOTP; a API de convite de empresa gera link para compartilhamento manual.
- A rotina de conta sem e-mail/e-mail opcional ainda não está implementada integralmente: cadastro atual usa confirmação nativa do Supabase Auth e algumas APIs exigem `email_confirmed_at`. A próxima etapa de desenvolvimento é separar identidade de login do e-mail de contato, criar identificador exclusivo para contas sem e-mail, garantir senha individual, definir recuperação segura sem e-mail e implementar fila assíncrona de confirmação/envio para e-mails opcionais. Não comprar/configurar domínio agora.
- O usuário precisa realizar o primeiro login no Preview e configurar o TOTP; senha e códigos do autenticador nunca devem ser enviados no chat.


## Rotina de identidade e acesso com e-mail opcional — desenho e pendências (24/11/2026)

### Situação verificada no código DEV
- O formulário atual `conta.html` exige e-mail para criar conta; `js/conta.js` chama diretamente `supabase.auth.signUp({ email, password })`.
- Quando o Supabase não retorna sessão por exigir confirmação nativa, a interface orienta o usuário a confirmar o e-mail antes de entrar. Isso contraria a decisão de acesso imediato.
- `create-company.js`, `accept-company-invitation.js` e `invite-company-member.js` exigem e-mail confirmado e/ou correspondência de e-mail no convite.
- `m360_company_invitations.email` é obrigatório; o fluxo atual não permite convite de membro sem e-mail.
- Existem tabelas `m360_email_verifications` e `m360_email_status`, mas não foi encontrada rotina completa de fila/worker de envio assíncrono. Não considerar essas tabelas como fila funcional.
- O envio atual por Resend usa remetente de teste como fallback. Sem domínio/remetente verificado, não há garantia de entrega geral. A ausência de domínio próprio não deve bloquear a criação da conta nem exigir compra agora.

### Regras de produto que permanecem obrigatórias
1. E-mail é opcional e é um contato, não a identidade obrigatória da conta.
2. Cada participante tem identificador de acesso exclusivo e senha individual.
3. A conta fica utilizável imediatamente após o cadastro; verificação de e-mail, quando informado, é pendência assíncrona e nunca bloqueia login.
4. Convite continua sendo criado pelo administrador da empresa e aceito pelo próprio convidado após definir suas credenciais. Não orientar cadastro avulso para quem recebeu convite.
5. O primeiro cadastro pelo fluxo público de criação de empresa pode criar a empresa e receber papel empresarial admin; isso não concede papel de Administrador Global.
6. O papel global `platform_admin` permanece independente e não pode ser atribuído por formulário público, metadados editáveis ou criação de empresa.
7. Domínio/remetente próprios ficam como configuração futura. Não comprar domínio agora, não inventar endereços de e-mail e não usar domínio de terceiros.

### Arquitetura técnica a implementar
- Introduzir identificador de login único (username) separado do e-mail de contato.
- Para novas contas sem e-mail, não usar login baseado em endereço fictício que possa ser confundido com e-mail real. Como o Supabase Auth não oferece username nativo, implementar um adaptador server-side de credenciais: o backend resolve o identificador para a identidade interna e executa o fluxo de autenticação do Supabase, com rate limit por IP e identificador, resposta genérica contra enumeração, logs sem senha e retorno de sessão Supabase válida. O desenho final precisa ser validado com documentação atual do Supabase antes da codificação.
- Manter contas existentes com e-mail e senha funcionando; não converter nem renomear contas existentes automaticamente.
- Separar o e-mail de contato em tabela própria, com estado `pending`, `verified` ou `delivery_deferred`; guardar tokens apenas em hash, com expiração, uso único e limites de reenvio.
- Criar fila persistente de envio com tentativas, `next_attempt_at`, limite de tentativas, estado e erro sanitizado. Worker/cron envia quando houver remetente operacional; se não houver, mantém pendente sem bloquear o usuário. O segredo do provedor permanece exclusivamente no backend.
- Convites devem poder apontar para e-mail opcional ou identificador de login; a aceitação deve validar token aleatório/hash, expiração, empresa, estado do convite e identidade autenticada, sem comparar e-mail quando o convite não tiver e-mail.
- A recuperação de contas sem e-mail exige uma regra explícita e auditável. Opções em avaliação: códigos de recuperação de uso único entregues ao próprio usuário no cadastro, com hashes armazenados; e recuperação assistida por administrador da empresa, com confirmação de identidade, MFA do administrador, prazo de uso e auditoria. Não permitir que um administrador veja ou escolha a senha do participante.
- Antes de permitir cadastro sem e-mail, definir como evitar colisões de identificador, enumeração, força bruta, abuso de convites e tomada de conta; testar revogação de sessões após troca/reset de senha.

### Etapas de implementação
1. Aprovar a política de recuperação para contas sem e-mail.
2. Desenhar migração aditiva de identificadores, contatos, fila de envio e convites sem e-mail; preservar todas as contas e relações existentes.
3. Implementar APIs server-side de cadastro e login, mantendo compatibilidade com contas atuais.
4. Implementar verificação assíncrona de contato e fila de envio tolerante à ausência de domínio/remetente.
5. Adaptar criação/aceitação de convites e primeiro cadastro de empresa.
6. Implementar recuperação e revogação de sessões.
7. Testar duas empresas, convite com e sem e-mail, cadastro duplicado, login, troca de senha, expiração/reuso de token, rate limit e indisponibilidade do provedor de e-mail.
8. Só depois de validar tudo no Preview considerar promoção para produção, mediante autorização explícita.

### Limites desta atualização
- Esta seção registra o desenho e a inspeção do código; ainda não implementa o novo login sem e-mail nem altera tabelas/contas.
- Não houve mudança no banco, dados, Auth ou configurações de produção.
- A conta do Administrador Global existente permanece intacta; não criar uma segunda conta.
- O domínio próprio não é pré-requisito para desenvolver/testar cadastro e login sem e-mail. A entrega de e-mails para usuários gerais dependerá de provedor/remetente configurado; a fila deve tolerar essa pendência sem bloquear o acesso.


## Decisão aprovada — redefinição de senha pelo administrador da empresa (24/11/2026)

Esta decisão substitui a alternativa anterior de recuperação assistida/códigos pessoais como fluxo principal para membros sem e-mail.

### Fluxo obrigatório
1. O administrador da empresa abre Minha empresa > Participantes e escolhe "Redefinir senha" para um membro da própria empresa.
2. O backend valida sessão, empresa, vínculo ativo e papel `admin`; nunca confia no papel informado pelo navegador.
3. O sistema gera um link temporário, aleatório, de uso único, vinculado ao usuário e à empresa. O link é mostrado ao administrador para entrega direta ao participante, sem depender de e-mail/domínio.
4. O membro abre o link e define pessoalmente uma nova senha. O administrador não escolhe, não visualiza e não recebe a senha.
5. O backend valida o token, expiração, uso único, vínculo/estado do membro e aplica a nova senha à identidade Supabase Auth.
6. O token é consumido atomicamente; todos os outros links de redefinição pendentes para aquela conta são invalidados.
7. As sessões anteriores do membro devem ser revogadas conforme suporte efetivo do Supabase Auth, e a operação deve gerar evento de auditoria com ator, alvo, empresa, data, resultado e motivo opcional, sem registrar token ou senha.
8. O link deve expirar em prazo curto (proposta: 30 minutos), ser armazenado apenas como hash, protegido contra tentativas repetidas e nunca aparecer em logs/analytics. O link deve usar HTTPS no domínio Preview/produção já configurado, sem exigir domínio de e-mail próprio.
9. Se o membro não tiver e-mail, este mesmo fluxo funciona por entrega presencial/privada do link. Se tiver e-mail, a entrega pode ser manual pelo link ou futuramente por fila de e-mail; a confirmação do endereço continua independente do acesso.
10. A recuperação administrativa deve ser permitida apenas para membros da empresa do administrador. Administradores não podem redefinir a própria senha por esse mecanismo nem redefinir senha de Administrador Global. Para contas administrativas, manter fluxo de recuperação individual mais forte e auditado.

### Controles de segurança obrigatórios
- Criar tokens com CSPRNG, pelo menos 256 bits; persistir somente SHA-256 do token.
- Consumo atômico em transação/RPC: token não expirado, não usado, alvo correto, membro ativo e empresa correspondente.
- Rate limit por IP, administrador e conta-alvo; bloquear enumeração e respostas distintas que revelem existência de conta.
- Não alterar a senha na etapa de geração do link. A senha só muda quando o próprio membro conclui o formulário com o token válido.
- Registrar auditoria tanto na geração quanto na conclusão/falha relevante, sem segredos.
- Revogar sessões/tokens anteriores e exigir novo login; confirmar por teste real o comportamento de revogação, pois atualizar senha e invalidar sessões são operações distintas.
- O administrador deve confirmar a operação e, idealmente, registrar o motivo. A plataforma deve mostrar aviso para entregar o link diretamente ao titular e não em grupo público.
- Link nunca é enviado em e-mail automaticamente enquanto não houver remetente verificado. O domínio de e-mail próprio não é requisito para esta função.

### Escopo e estado
- A interface atual já oferece ação "Redefinir senha", mas sua implementação atual usa `auth.admin.generateLink({ type: 'recovery', email })` e, portanto, exige e-mail do membro. Isso não atende ao novo fluxo sem e-mail.
- A nova implementação exige tabela/RPC de tokens temporários, endpoints de geração e consumo, formulário dedicado para definir senha e testes de sessão/revogação. Não considerar concluída até esses componentes estarem implementados e testados.
- A redefinição administrativa aqui descrita é para membros de empresa; não concede ao administrador acesso à senha e não altera o papel/permissões do membro.
- A política de códigos pessoais de recuperação deixa de ser o fluxo primário para membros, pois a recuperação será feita pelo painel do administrador. Deve existir procedimento alternativo documentado para indisponibilidade do administrador, sem bypass de identidade.


## Correção do erro ao salvar respostas dos módulos — 24/11/2026

### Relato do teste
O usuário informou que, ao salvar uma avaliação, a interface apresentava: "Não foi possível salvar as respostas do módulo".

### Causa técnica confirmada no Supabase DEV
- O endpoint `functions/api/company-assessment-module.js` chama a RPC `save_m360_company_assessment_module`.
- A definição ativa da RPC no banco DEV continha chamadas a `jsonb_object_length(p_answers)`.
- A função `jsonb_object_length(jsonb)` não existe na instalação PostgreSQL deste projeto. Consulta `to_regprocedure('pg_catalog.jsonb_object_length(jsonb)')` retornou NULL.
- Isso causa erro interno durante a execução da RPC, que o endpoint traduz corretamente para a mensagem genérica apresentada na interface.
- A extensão `pgcrypto` está instalada em `extensions`; `extensions.digest(text,text)` existe. Logo, o defeito confirmado é a função inexistente de contagem de chaves JSONB, não a extensão de hash.

### Correção aplicada
- Aplicada migração `fix_jsonb_object_count_in_module_save` no Supabase DEV.
- A expressão de contagem foi substituída por `(SELECT count(*) FROM jsonb_object_keys(p_answers))`, compatível com PostgreSQL.
- Preservada a definição e as demais validações da RPC; privilégios foram reafirmados: execução pelo `service_role`, sem execução direta por `PUBLIC`, `anon` ou `authenticated`.
- Arquivo da migração versionado em `supabase/fix-jsonb-object-count-in-module-save.sql`.
- Consulta posterior confirmou ausência de `jsonb_object_length` e presença da nova contagem; `service_role` pode executar e `authenticated` não pode executar diretamente.

### Limites de validação
- A migração foi aplicada e a definição/privilégios foram verificados no banco DEV.
- Ainda não foi executado um salvamento funcional com uma avaliação real e sessão de usuário no navegador; não declarar o problema integralmente resolvido até o usuário repetir o teste.
- Nenhum dado de avaliação foi modificado pelo diagnóstico.
- Produção permanece intocada.

### Próxima ação
Repetir o salvamento no Preview DEV. Se persistir, capturar o status HTTP e a resposta sanitizada da chamada `/api/company-assessment-module` no DevTools > Network, sem compartilhar tokens, cookies ou cabeçalhos de autorização. Investigar então o código SQLSTATE da nova falha.


# QUADRO GERAL DE ACOMPANHAMENTO — Mapa 360
Atualizado em 24/11/2026 após confirmação do usuário de que o salvamento dos módulos voltou a funcionar no Preview DEV.

Legenda: [x] concluído e confirmado; [~] implementado parcialmente ou depende de validação externa/usuário; [ ] pendente. Um item só passa a [x] quando houver evidência técnica e/ou teste funcional compatível com o que está sendo afirmado.

## 1. Base do produto e arquitetura
- [x] Dois modos de avaliação definidos: consultoria guiada e autoavaliação autônoma.
- [x] Papéis empresariais definidos: administrador da empresa e membro com acesso aos módulos atribuídos.
- [x] Fluxo de convite definido: administrador convida; convidado cria credenciais próprias, autentica e aceita o convite.
- [x] Separação entre participantes entrevistados e membros que possuem login.
- [x] Fases do processo definidas: Triagem inicial, Diagnóstico consultivo, Plano de melhoria e Acompanhamento.
- [x] Regras do relatório executivo/técnico e snapshot versionado definidas.
- [x] Plano de melhoria 5W2H/Gantt definido como etapa posterior, com construção e aprovação conjunta.
- [x] Ordem oficial: finalizar e estabilizar o aplicativo antes de implementar 5W2H e Gantt.
- [~] Cópia de avaliação implementada na DEV; validação visual/funcional completa pelo usuário ainda pendente.

## 2. Identidade, contas e permissões
- [x] Conta designada para Administrador Global localizada no Supabase DEV.
- [x] Papel `platform_admin` separado dos papéis empresariais e ativo para a conta designada na DEV.
- [x] Papel empresarial existente da conta preservado; não houve promoção automática a administrador da empresa.
- [~] Painel global e autenticação individual/MFA implementados em código na DEV, mas primeiro login e cadastro TOTP ainda precisam ser testados no navegador pelo usuário.
- [ ] Finalizar cadastro com e-mail opcional e identificador de login exclusivo.
- [ ] Garantir acesso imediato sem aguardar confirmação de e-mail.
- [ ] Preservar compatibilidade das contas existentes com e-mail.
- [ ] Permitir convites e aceitação sem e-mail, mantendo token seguro e identidade individual.
- [ ] Criar fila assíncrona de confirmação de e-mail com retentativas, limites e estados; ausência de remetente não pode bloquear o acesso.
- [x] Decisão confirmada: não comprar domínio próprio agora; preparar remetente/domínio próprio como configuração futura.
- [ ] Implementar recuperação administrativa de senha: admin da própria empresa solicita; backend gera link aleatório de uso único; membro define a nova senha; admin nunca vê nem escolhe a senha.
- [ ] Implementar expiração curta (proposta inicial 30 min), hash do token, consumo atômico, rate limit, auditoria, invalidação de links concorrentes e teste real de revogação de sessões.
- [ ] Definir contingência segura se não houver administrador disponível para iniciar a recuperação.
- [ ] Não permitir que administrador empresarial redefina a própria senha por esse fluxo ou a senha do Administrador Global.

## 3. Segurança e integridade
- [x] Limites de requisição adicionados em diversas rotas empresariais e administrativas na DEV.
- [x] Verificações de origem adicionadas em rotas administrativas legadas revisadas.
- [x] Proteção contra falsa autovalidação e falsa aprovação no envio público implementada na DEV.
- [x] Validação server-side de completude/contexto da autoavaliação pública implementada e coberta por testes isolados.
- [x] RPC de salvamento de módulos mantém privilégios restritos ao service_role; execução direta por authenticated/anon revogada e verificada.
- [x] Defeito de salvamento corrigido: função inexistente jsonb_object_length substituída por contagem via jsonb_object_keys na RPC da DEV.
- [x] Usuário confirmou teste funcional no Preview: salvamento das respostas dos módulos voltou a funcionar.
- [~] Validações empresariais e públicas foram implementadas em camadas, mas ainda falta suíte funcional ampla com contas reais e cenários de autorização.
- [ ] Revisar todas as APIs, RPCs, funções SECURITY DEFINER, RLS e privilégios de forma integral.
- [ ] Testar isolamento entre duas empresas e impedir acesso cruzado a avaliações, módulos, convites e membros.
- [ ] Testar elevação indevida de privilégios, manipulação de payloads, concorrência, replay de tokens, CSRF/XSS e abuso de endpoints.
- [ ] Revisar recuperação, troca de senha e revogação de sessões.
- [ ] Revisar completamente renderização e pontos de entrada de conteúdo do usuário.
- [ ] Configurar proteção da branch DEV no GitHub (PR, revisão e checks); o conector não oferece alteração das regras.
- [ ] Revisar WAF, regras, bot protection, rate limiting, cache e secrets no painel Cloudflare; ainda sem inspeção comprovada.
- [ ] Não houve pentest independente; não declarar o aplicativo invulnerável ou totalmente auditado.
- [~] Proteção contra senhas vazadas está desativada por limitação do plano Free da organização Supabase; reavaliar quando houver upgrade, sem ser bloqueio para as demais correções.
- [ ] Resolver/justificar alertas de índices e RLS do Supabase Advisor após revisão contextual; não desativar controles apenas para eliminar alertas.

## 4. Testes e publicação
- [x] Correção do salvamento confirmada no banco DEV por inspeção da RPC e privilégios.
- [x] Correção do salvamento confirmada pelo usuário no Preview DEV.
- [~] Testes isolados da validação pública executados; não equivalem a teste E2E completo.
- [ ] Testar primeiro acesso do Administrador Global e configurar TOTP no navegador.
- [ ] Testar cadastro/login/convite e recuperação de ponta a ponta.
- [ ] Testar avaliação completa, salvar, sair, retornar, editar, concluir e consultar relatório.
- [ ] Verificar publicação/estado do Cloudflare Pages Preview; não presumir deploy apenas por commit.
- [ ] Fazer regressão funcional completa antes de qualquer promoção.
- [ ] Produção permanece sem alterações; qualquer aplicação requer autorização explícita do usuário.
- [ ] Preparar plano de promoção DEV → produção com backup, migrações revisadas, janela, rollback e autorização.
- [ ] Avaliar terceiro projeto Supabase para consolidação futura; não mesclar DEV e produção diretamente.

## 5. Relatórios e etapas futuras
- [ ] Mapear catálogo completo de perguntas, indicadores, pesos e critérios de maturidade para relatório.
- [ ] Implementar relatório executivo visual com detalhamento técnico e distinção entre declaração, evidência, hipótese e validação.
- [ ] Implementar snapshots versionados do relatório.
- [ ] Planejar benchmarks somente com fonte, amostra e metodologia documentadas.
- [ ] Depois da estabilização do app, implementar plano de melhoria 5W2H.
- [ ] Implementar aprovação dupla (consultor autorizado + administrador da empresa), versionamento e invalidação de aprovações após mudanças substanciais.
- [ ] Implementar Gantt derivado das ações aprovadas e acompanhamento dos resultados.

## 6. Última correção e ponto de retomada
- Branch exclusiva: `feature/1.2.0-contas-usuarios`.
- Último HEAD conhecido nesta atualização: `17b7289436ab819d0dd96bc7b9047f7672a0bdf3`.
- Supabase DEV: projeto `adelbfwfyferfqudhuka`.
- Correção: migração `fix_jsonb_object_count_in_module_save`, arquivo `supabase/fix-jsonb-object-count-in-module-save.sql`.
- Confirmação do usuário: "Deu certo" — salvamento das respostas voltou a funcionar.
- Produção: não alterada.
- Próxima prioridade técnica: implementar recuperação de senha pelo painel de administrador da empresa com link de uso único e senha criada pelo próprio membro; em paralelo, desenhar e implementar cadastro/login com e-mail opcional sem quebrar contas existentes. A ordem detalhada deve começar pela revisão de arquitetura e migração aditiva, sem tocar produção.
- Regra permanente: atualizar este quadro e a documentação viva a cada etapa; marcar [x] somente após confirmação suficiente.


## Atualização de implementação — recuperação administrativa de senha (24/11/2026)

### Implementado na DEV nesta rodada
- Criadas tabelas privadas `private.m360_member_password_resets` e `private.m360_member_security_events`, com RLS habilitado e acesso direto revogado para `PUBLIC`, `anon` e `authenticated`.
- Criadas RPCs de emissão e consumo atômico de tokens; EXECUTE permitido somente a `service_role`.
- Token com 256 bits aleatórios gerado no backend; somente SHA-256 é armazenado. Link expira em 30 minutos; emissão invalida links anteriores do mesmo membro.
- Endpoint `company-manage-member` agora emite link próprio para redefinição, sem depender de e-mail. Só administrador ativo da mesma empresa pode solicitar; só alvo com papel `member` ativo pode ser alvo. Auto-redefinição e Administrador Global são bloqueados.
- Criado endpoint `/api/member-password-reset` para consumir o token e atualizar a senha com Supabase Auth Admin. Rate limit por IP. Token é consumido uma única vez; se a atualização de senha falhar após consumo, o administrador precisará emitir outro link.
- Formulário `conta.html`/ `js/conta.js` adaptado para abrir link próprio, retirar token da barra de endereço e permitir que o próprio membro defina a senha. A ação de redefinir aparece apenas para membros comuns.
- Arquivo SQL versionado em `supabase/member-password-reset.sql`.

### Verificações já realizadas
- Banco DEV confirma as duas tabelas e RLS habilitado na tabela de tokens.
- RPCs de emissão/consumo executáveis por `service_role`; sem EXECUTE direto para `authenticated`.
- Nenhum e-mail ou domínio próprio é necessário: administrador copia e entrega o link HTTPS ao membro.
- Não foi realizado ainda um teste ponta a ponta com membro real no Preview.

### Limitações ainda abertas — não marcar como concluído
- Testar emissão, entrega manual, validade de 30 minutos, uso único, link concorrente invalidado e definição de senha no Preview.
- Confirmar comportamento de revogação global de sessões. Supabase não permite revogar access JWT já emitidos antes do vencimento; revogação de refresh tokens exige um JWT válido do próprio usuário. O fluxo customizado ainda não obtém esse JWT. Não afirmar que sessões antigas foram revogadas; planejar controle de sessão/expiração e validação de session_id em rotas sensíveis.
- Avaliar auditoria de falhas/abuso e proteção contra exposição de link em histórico/telemetria. A tabela registra emissão e conclusão bem-sucedidas.
- O reset atual é exclusivo para membros comuns da empresa; administradores empresariais e Administrador Global usam recuperação própria.
- Produção permanece intocada.

### Estado do quadro
- [x] Estrutura privada de tokens, hash, expiração e uso único criada na DEV.
- [x] Autorização do administrador da mesma empresa e bloqueio de auto-reset/Administrador Global.
- [x] Endpoint de redefinição independente de e-mail e domínio.
- [x] Interface de membro para definir nova senha.
- [~] Teste ponta a ponta no Preview pendente.
- [ ] Revogação de sessões antigas e controles de JWT/session_id pendentes.


## Administrador Master e diálogos integrados — 24/11/2026

### Regras do Administrador Master por empresa
- Cada empresa pode ter no máximo um Administrador Master, marcado por `m360_company_members.is_master_admin` e protegido por índice único parcial.
- O Master precisa ser um administrador empresarial ativo.
- A designação e remoção do Master são operações exclusivas do Administrador Global da plataforma, autenticado com MFA.
- Administradores da empresa não podem remover, bloquear, rebaixar ou transferir o Administrador Master. A RPC `manage_m360_company_member` aplica a proteção no banco, não apenas na interface.
- A remoção pelo Administrador Global exige referência da solicitação formal do contratante e essa referência é incluída na auditoria da operação.
- A remoção do vínculo Master não apaga a conta Auth nem avaliações; apenas retira o vínculo com a empresa.
- O Administrador Master pode ter sua senha redefinida por outro administrador ativo da mesma empresa, por link de uso único; o Administrador Global continua protegido contra esse fluxo.
- A empresa pode ficar temporariamente sem Master até a designação do representante indicado pelo contratante. A regra de um único Master não força designação automática sem autorização do cliente.

### Correção do link de redefinição
- Causa localizada: a RPC consultava `private.m360_platform_roles.status`, mas a tabela utiliza `is_active`. A condição sempre falhava para validar corretamente o Administrador Global e impedia a emissão.
- RPC corrigida para `is_active=true`; a redefinição agora aceita qualquer membro ativo da empresa, inclusive administradores e Master, exceto a própria conta do solicitante e o Administrador Global.
- UI de gestão passou a exibir a ação de redefinir senha para todos os perfis empresariais, exceto o próprio administrador que está logado (a API também bloqueia auto-reset).
- O link continua com token de 256 bits, hash SHA-256 no banco, validade de 30 minutos, uso único e invalidação de links anteriores.

### Diálogos e experiência
- Criado diálogo visual integrado ao padrão do Mapa 360 na página de conta para confirmação, edição de nome e geração de link.
- Criado diálogo visual no painel do Administrador Global; designação/remoção Master e exclusão de avaliação não usam mais `window.confirm`/`window.prompt`.
- Criados diálogos visuais em Avaliações da empresa para cópia, remoção de módulo e troca de responsável.
- Varredura dos nove arquivos JavaScript em `js/` não encontrou mais chamadas a `window.confirm`, `window.prompt` ou `window.alert`.
- Outras perguntas de interface fora desses arquivos/páginas ainda devem ser revisadas quando forem identificadas.

### Verificações técnicas
- Banco DEV: coluna `is_master_admin` e índice único parcial criados.
- RPC de proteção de membros e RPC de gestão Master presentes.
- EXECUTE das RPCs de gestão Master, gestão de membro e emissão de reset: permitido a `service_role`; negado a `authenticated` e `anon`.
- Endpoints e interface versionados na branch DEV.
- Não houve teste ponta a ponta em navegador para emissão do link, designação Master, remoção mediante referência, nem confirmação visual dos diálogos. Marcar como implementação, não como validação funcional concluída.
- Produção continua intocada.


### Ajustes complementares após revisão — 24/11/2026
- A redefinição de senha também foi liberada para Administrador Master; a proteção do Master se aplica à remoção/bloqueio/rebaixamento/transferência por administradores empresariais, não à recuperação de senha.
- Remoção do Master pelo Administrador Global agora exige referência da solicitação do contratante (mínimo de 5 caracteres) e inclui a referência no evento de auditoria de acesso global.
- ACL das três RPCs foi consultada após os ajustes: `service_role` pode executar; `authenticated` e `anon` não podem executar.
- Varredura de arquivos JavaScript e HTML do aplicativo não encontrou mais chamadas a diálogos nativos `window.confirm`, `window.prompt` ou `window.alert`.
- O Preview precisa atualizar para testar as telas e operações. Nenhuma remoção ou designação de Administrador Master foi executada em dados reais; o novo perfil ainda precisa ser atribuído a uma pessoa indicada pelo contratante.


### Exclusividade do Administrador Global proprietário
- Para garantir que somente o usuário responsável pela plataforma possa designar ou remover Administradores Master das empresas, foi criado `private.m360_platform_roles.is_platform_owner`.
- A conta única que já era Administrador Global ativo na DEV foi marcada como proprietária da plataforma. Verificação: 1 Administrador Global ativo e 1 proprietário ativo.
- A RPC de gestão Master exige simultaneamente papel `platform_admin` ativo e `is_platform_owner=true`; demais Administradores Globais futuros não herdarão automaticamente essa capacidade.
- ACL confirmada: somente `service_role` executa a RPC; `authenticated` e `anon` não executam diretamente.
- Nenhum Administrador Master empresarial foi atribuído automaticamente; a indicação depende do contratante e será feita pelo proprietário da plataforma.


## Correção do primeiro acesso e conflito entre redirecionamento e guia (24/11/2026)

### Causa identificada por inspeção estática

O botão **Começar agora** abre `/conta.html?cadastro=1&entrada=admin`. Após identificar uma sessão de administrador, `js/conta.js` encaminha o navegador para `/?guia=admin&etapa=0`. Na página inicial, porém, `js/account-menu.js` também detectava a sessão vinculada à empresa e redirecionava imediatamente para `/inicio.html`. Ao mesmo tempo, `js/guide.js` tentava iniciar a apresentação e conduzir o usuário entre Início, Minha conta e Avaliações. Essas navegações concorrentes explicam a sequência de carregamentos/telas observada e podem interromper o guia.

Havia ainda uma segunda inicialização automática do guia na página inicial para qualquer usuário autenticado que ainda não tivesse a chave local de apresentação concluída. Isso podia disputar a navegação mesmo sem um pedido explícito do usuário.

### Ajustes aplicados na branch DEV

- O redirecionamento automático para `/inicio.html` não ocorre quando a URL contém os parâmetros explícitos do guia (`guia`/`etapa`). Assim, a navegação guiada consegue controlar a sequência de páginas.
- O guia deixou de iniciar sozinho apenas porque existe uma sessão autenticada. Ele passa a iniciar por uma solicitação explícita: fluxo de primeiro acesso encaminhado com `?guia=...` ou ação manual **Conhecer o Mapa 360 · Guia rápido** / **Rever apresentação**.
- Atualizadas as referências de cache dos scripts nas páginas que os carregam.

### Limites da verificação

A causa foi confirmada pela leitura dos fluxos e das condições de redirecionamento no código da branch DEV. Os ajustes foram gravados no GitHub DEV; ainda dependem de novo Preview e teste manual no navegador para confirmar o percurso visual completo. Não houve alteração no Supabase nem em produção. O arquivo `js/onboarding.js` não é carregado pelas páginas principais examinadas; o guia efetivamente ativo neste fluxo é `js/guide.js`.


## Ajuste de entrada de contas existentes e apresentação para testadores — 24/11/2026

### Comportamento definido
- Depois de autenticar uma conta empresarial já existente (administrador ou membro), o destino padrão passa a ser diretamente `/inicio.html`.
- O login não inicia o guia automaticamente nem redireciona para a apresentação guiada. O guia continua disponível por ação explícita do usuário.
- O fluxo de convite permanece separado: após criar a senha e aceitar o convite, o participante segue o fluxo específico de entrada.
- O cadastro inicial de nova empresa permanece distinto do login de contas existentes.

### Página pública para apresentação
- A página pública foi ajustada para apresentar o Mapa 360 com posicionamento mais comercial: diagnóstico estruturado, identificação de oportunidades e prioridades de evolução.
- O CTA principal passou a destacar o início do diagnóstico; foi incluído acesso explícito para quem já possui conta, além da apresentação rápida.
- Ajustadas descrição e título da página e os estilos das ações secundárias.

### Arquivos alterados nesta rodada
- `js/conta.js`: login de conta existente direciona a Início.
- `conta.html`: atualização de versão do script para evitar cache antigo.
- `index.html`: título, descrição e textos comerciais da página pública; atalho de login.
- `css/onboarding.css`: apresentação das ações secundárias.

### Limites e validação
- Alterações gravadas somente na branch DEV `feature/1.2.0-contas-usuarios`.
- Não houve alteração no Supabase nem em produção.
- O comportamento foi verificado por inspeção do fluxo de login e do código alterado; ainda falta teste real no Preview para confirmar login de administrador e membro, bem como navegação e responsividade da página pública.
- O endereço de Preview do deployment anterior não deve ser presumido como URL do novo commit. Compartilhar a URL somente depois de o Cloudflare apresentar o deployment atualizado e seu endereço exato.
