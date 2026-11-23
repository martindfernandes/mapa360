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

## APIs iniciais adicionadas ao GitHub DEV

- `functions/api/company-assessments.js`: autentica o usuário, valida vínculo ativo com a empresa, lista avaliações; somente administrador cria avaliação e seus módulos oficiais. Participante comum recebe apenas avaliações nas quais possui ao menos um módulo atribuído.
- `functions/api/company-assessment-module.js`: consulta dados compartilhados e módulos; administrador consulta todos, participante comum somente os atribuídos. Permite ao administrador atribuir/desatribuir módulo a membro ativo da mesma empresa. Permite salvar respostas somente no módulo autorizado, com comparação de `updated_at` para detectar gravações concorrentes.
- Ambos os endpoints bloqueiam acesso fora da branch DEV, exigem mesma origem e validam o token de sessão com Supabase Auth. Nenhuma chave secreta vai ao navegador.

Essas APIs são uma primeira camada de backend, ainda sem integração com a interface e sem testes de ponta a ponta. A consolidação final ainda não foi criada. A criação de avaliação usa duas operações sequenciais; caso a criação dos módulos falhe, tenta remover a avaliação recém-criada. Antes de produção, essa operação deve ser substituída por transação/RPC atômica.

## Limites desta etapa

Foram aplicadas somente duas migrações aditivas no Supabase DEV: criação das tabelas de avaliação/módulos e revogação de execução pública da função interna de RLS. Não houve alteração nem exclusão de dados existentes. Foram adicionados dois endpoints ao GitHub DEV; nenhum deploy foi realizado. O questionário atual e a interface ainda não foram alterados.
