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

## APIs iniciais adicionadas ao GitHub DEV

- `functions/api/company-assessments.js`: autentica o usuário, valida vínculo ativo com a empresa, lista avaliações; somente administrador cria avaliação e seus módulos oficiais. Participante comum recebe apenas avaliações nas quais possui ao menos um módulo atribuído.
- `functions/api/company-assessment-module.js`: consulta dados compartilhados e módulos; administrador consulta todos, participante comum somente os atribuídos. Permite ao administrador atribuir/desatribuir módulo a membro ativo da mesma empresa. Permite salvar respostas somente no módulo autorizado, com comparação de `updated_at` para detectar gravações concorrentes.
- Ambos os endpoints bloqueiam acesso fora da branch DEV, exigem mesma origem e validam o token de sessão com Supabase Auth. Nenhuma chave secreta vai ao navegador.

Essas APIs são uma primeira camada de backend, ainda sem integração com a interface e sem testes de ponta a ponta. A consolidação final ainda não foi criada. A criação de avaliação usa duas operações sequenciais; caso a criação dos módulos falhe, tenta remover a avaliação recém-criada. Antes de produção, essa operação deve ser substituída por transação/RPC atômica.

## Limites desta etapa

Foram aplicadas somente duas migrações aditivas no Supabase DEV: criação das tabelas de avaliação/módulos e revogação de execução pública da função interna de RLS. Não houve alteração nem exclusão de dados existentes. Foram adicionados dois endpoints ao GitHub DEV; nenhum deploy foi realizado. O questionário atual e a interface ainda não foram alterados.
