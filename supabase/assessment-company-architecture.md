# Arquitetura de avaliações vinculadas a empresas

**Status:** proposta técnica para validação no Supabase DEV.  
**Branch:** `feature/1.2.0-contas-usuarios`  
**Não aplicar como migration SQL.** Este documento registra o desenho antes da inspeção do esquema efetivo do banco.

## 1. Objetivo

Permitir que uma avaliação pertença a uma empresa e seja respondida por vários participantes, cada um limitado aos módulos atribuídos. O administrador da empresa pode consultar e editar todos os módulos e acompanhar o andamento. As respostas precisam permanecer disponíveis após sair do navegador ou trocar de computador.

## 2. Estrutura atual observada no repositório

- `m360_companies`: cadastro de empresas.
- `m360_company_members`: vínculo usuário/empresa, papel (`admin` ou `member`) e status.
- `m360_company_invitations`: convites de participantes para ingressar na empresa.
- `m360_invitations`: convites do fluxo antigo de avaliação, com `company_id` e `created_by_user_id` adicionados pela migração de contas.
- `m360_drafts`: um JSONB integral por convite de avaliação.
- `m360_submissions`: resultado integral concluído por convite.

O fluxo atual de avaliação usa token de convite público e grava o JSON completo em `m360_drafts`. O fluxo de contas autentica usuários e os vincula a empresas, mas ainda não controla atribuição e acesso por módulo.

## 3. Modelo de dados proposto

A proposta é estender o modelo atual, preservando `m360_invitations`, `m360_drafts` e `m360_submissions` para compatibilidade e histórico.

### 3.1 Avaliação empresarial

A avaliação continua identificada por `m360_invitations.id`. Para uma avaliação criada no novo fluxo:

- `company_id` obrigatório e validado no servidor;
- `created_by_user_id` preenchido com o administrador autenticado;
- vínculo com uma única empresa;
- configuração inicial e estado geral mantidos em uma tabela de workspace associada à avaliação.

Não associar avaliações antigas automaticamente pelo nome da empresa. Registros legados com `company_id IS NULL` permanecem intactos até decisão explícita de migração.

### 3.2 Workspace e configuração compartilhada

Criar uma tabela de workspace por avaliação, com chave estrangeira para `m360_invitations` e `company_id`. Ela guardará os dados de contexto e configuração que precisam ser comuns a todos: nome/segmento, módulos habilitados, ramo, produtos, versão do instrumento, etapa/status e metadados necessários para reconstruir o questionário.

O JSON compartilhado não deve conter respostas individuais dos módulos. A criação e atualização do workspace devem validar que a avaliação e a empresa correspondem.

### 3.3 Módulos e atribuições

Criar uma tabela de módulos da avaliação, com uma linha por módulo habilitado:

- avaliação;
- identificador estável do módulo (os IDs atuais do questionário: `geral`, `segmento`, `contexto_industrial`, `ppcp`, `automacao`, `dados_bi`, `administrativo`, `projetos`);
- usuário responsável, inicialmente opcional;
- estado do módulo (não iniciado, em andamento, concluído);
- datas de criação/atualização.

A atribuição deve aceitar somente membro ativo da mesma empresa. O módulo `geral` é obrigatório. Os módulos habilitados precisam corresponder à configuração da avaliação.

### 3.4 Respostas por módulo

Criar uma tabela de respostas com uma linha por avaliação/módulo, contendo JSONB das respostas daquele módulo, versão do formato, usuário da última alteração e timestamps.

A gravação deve ser atômica por módulo. Uma atualização do participante nunca pode substituir as respostas de outro módulo. A API deve validar os IDs de perguntas permitidos para o módulo no servidor; não confiar no módulo ou nos IDs enviados pelo navegador.

Dados auxiliares fora de `answers` (por exemplo, objetivos, oportunidades, estimativas e pesos) precisam ter regra de propriedade definida. Por padrão, ficam editáveis apenas pelo administrador até que exista atribuição explícita para essas áreas.

## 4. Regras de autorização

Toda API nova exige sessão Supabase válida e vínculo ativo em `m360_company_members`.

| Ação | Administrador | Participante |
|---|---:|---:|
| Listar avaliações da empresa | Sim | Apenas avaliações em que participa, conforme política do produto |
| Ver configuração compartilhada | Sim | Sim, somente leitura |
| Criar avaliação | Sim | Não |
| Habilitar/desabilitar módulos | Sim | Não |
| Atribuir/reatribuir módulos | Sim | Não |
| Ler respostas de qualquer módulo | Sim | Somente módulos atribuídos |
| Gravar respostas | Sim, qualquer módulo | Somente módulos atribuídos |
| Editar objetivos, oportunidades e parâmetros globais | Sim | Não, salvo regra futura explícita |
| Concluir avaliação | Sim | Não, até regra futura explícita |

O backend deve conferir papel, status do membro, empresa, avaliação, módulo atribuído e estado da avaliação em cada operação. Ocultar controles na interface não é controle de segurança.

O administrador não deve conseguir acessar uma avaliação de outra empresa, mesmo que conheça seu UUID. Um participante bloqueado perde acesso imediatamente.

## 5. APIs previstas

Os nomes são sugestões; devem ser alinhados aos padrões existentes antes da implementação.

- `company-assessments`: listar e criar avaliações da empresa.
- `company-assessment`: carregar configuração e estado da avaliação.
- `company-assessment-modules`: habilitar módulos e atribuir responsáveis (admin).
- `company-assessment-module-data`: ler/gravar respostas de um módulo com validação de autorização.
- `company-assessment-result`: compor o resultado completo para administrador.
- `company-assessment-submit`: validar conclusão e consolidar resultado.

As APIs devem reutilizar os auxiliares de autenticação, validação de origem, rate limit, parsing e respostas HTTP existentes, sem reutilizar o token de convite público como identidade de participante.

## 6. Compatibilidade e preservação

1. Não remover nem renomear tabelas existentes.
2. Não apagar nem reescrever rascunhos ou resultados antigos.
3. Não preencher `company_id` legado com base apenas em `company_name`.
4. Manter o fluxo público antigo funcionando durante a transição.
5. Novas avaliações empresariais usam autenticação e autorização por empresa/módulo.
6. A consolidação final recompõe o objeto `m360-assessment` no formato atual, mantendo `schemaVersion` e `instrumentVersion`.
7. Antes de habilitar o novo fluxo, testar recuperação em outro navegador/computador e concorrência entre dois participantes.

## 7. Migração — sequência segura

A migration SQL deverá ser elaborada somente após consulta ao banco DEV real:

1. Inspecionar colunas, tipos, constraints, índices, funções, grants e RLS das tabelas atuais.
2. Comparar o banco com `schema.sql`, `accounts-schema.sql`, `accounts-functions.sql`, `company-invitations.sql` e demais SQL versionados.
3. Identificar diferenças e criar migration aditiva, idempotente e compatível com os dados atuais.
4. Criar tabelas e índices novos; adicionar apenas colunas estritamente necessárias.
5. Aplicar RLS restritiva e manter acesso somente via backend confiável/service role, conforme padrão atual.
6. Criar funções transacionais para operações que exigem consistência entre atribuição, respostas e status.
7. Executar verificações de integridade e testes com duas empresas isoladas.
8. Só depois integrar as APIs e a interface.

**Bloqueio atual:** o esquema efetivo do Supabase DEV ainda não foi consultado. Não executar SQL com base apenas nos arquivos do GitHub.

## 8. Critérios de aceite

- Duas empresas não conseguem consultar ou alterar dados uma da outra.
- Participante A só lê e grava módulos atribuídos a A.
- Participante B só lê e grava módulos atribuídos a B.
- Atualizações simultâneas em módulos diferentes não sobrescrevem dados.
- Administrador visualiza e edita todos os módulos e acompanha status/responsáveis.
- Respostas permanecem salvas ao trocar de navegador/computador.
- Resultado consolidado preserva o formato esperado pelo relatório atual.
- Avaliações legadas continuam acessíveis e intactas.
- Bloqueio de participante interrompe imediatamente as operações.
- Nenhuma alteração alcança o Supabase de produção.

## 9. Próximo passo

Conectar o projeto Supabase ao ambiente de trabalho para consultar o esquema efetivo do projeto **mapa360-dev**. Depois dessa leitura, elaborar a migration SQL real e revisar seu impacto antes de qualquer execução.
