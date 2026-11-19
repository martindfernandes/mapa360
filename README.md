# Mapeamento 360 Autoavaliação · v1.0.9 + correção Netlify

Projeto irmão independente do Mapeamento 360 original. A interface reaproveita o instrumento v3.1.1, com navegação simplificada para autoavaliação do cliente e benchmarking separado.

## Acesso
- `index.html`: prévia e questionário da empresa. Sem `?token=`, abre em modo demonstração local.
- `admin.html`: painel administrativo; autenticação via `ADMIN_API_TOKEN`.
- Convites são individuais, expiram e armazenam somente hash SHA-256 do token.

## Backend
Netlify Functions + Supabase + Resend. Execute `npm install` e aplique `supabase/schema.sql` no projeto Supabase. Configure as variáveis de `.env.example` no Netlify. Nunca exponha `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_API_TOKEN` ou `RESEND_API_KEY` no frontend.

## Notificação
O destinatário das notificações de conclusão é definido pela variável `NOTIFICATION_EMAIL` no Netlify. Convites podem ser enviados ao contato cadastrado. O envio depende de configurar `RESEND_API_KEY` e um remetente verificado em `EMAIL_FROM`.

## Limitações desta entrega
Esta é a primeira estrutura funcional do projeto irmão, não uma implantação já conectada. Para links individuais, painel e notificações operarem, ainda é necessário criar o projeto Supabase, aplicar o SQL, configurar as variáveis no Netlify e publicar. O status “em andamento” e o salvamento remoto de rascunhos são registrados quando a empresa usa um link individual e o backend está configurado.

## Publicação
Conecte a pasta a um repositório GitHub e publique pelo Netlify. Build command: `npm install`; publish directory: `.`. Configure as variáveis acima.


## Alterações da versão 1.0.2

- Catálogo transversal de produtos, equipamentos e famílias, disponível independentemente do segmento selecionado.
- Inclusão de famílias como caminhões-pipa, tanques rodoviários, comboios de abastecimento, unidades móveis de lubrificação, oficinas móveis, irrigação, aplicação de calda, lavagem industrial, hidrojateamento, sucção/vácuo, drones e implementos especiais.
- Campo de produto livre com sugestões do catálogo e percentual aproximado de similaridade; o usuário pode manter qualquer descrição própria.
- Atalho para pesquisar o termo informado na web.


## Versão 1.0.2 — relatório executivo
- Removidas do fluxo de autoavaliação as telas de plano de melhoria e acompanhamento, incluindo oportunidades, estimativas, horas e custos de consultoria, terceiros e licenças.
- Relatório preparado como apresentação executiva para impressão em PDF.
- Incluído gráfico de maturidade por grupo de avaliação.
- Incluída seção de benchmarking comparativo em formação, sem inventar rankings ou médias antes de existir amostra comparável suficiente.


## Versão 1.0.3 — exportação do relatório
- Botão destacado “Gerar PDF” no cabeçalho da etapa Relatório executivo.
- Instrução explícita para escolher “Salvar como PDF” na janela de impressão do navegador.
- Mensagem de orientação quando o segmento ainda não foi informado.


## Versão 1.0.5 — relatório e cópia completa

- O dashboard de maturidade oferece acesso direto ao relatório executivo.
- O relatório pode ser impresso isoladamente para apresentação ou salvo como PDF pelo navegador.
- A tela do relatório permite salvar uma cópia HTML independente com o aplicativo e os dados incorporados e criptografados.
- A senha é definida no momento da exportação e deve ser compartilhada separadamente.
- Nome padrão do arquivo: `Mapeamento 360 - EMPRESA - AAAA-MM-DD.html`.


## Versão 1.0.6 — identidade Industrial Executivo e relatório horizontal

- Cabeçalho atualizado com a ação **Salvar app + Dados** ao lado da versão do aplicativo.
- Paleta Industrial Executivo com azul-marinho, azul-petróleo e laranja, além de cores de destaque distintas para ramos, produtos, modelos de negócio e especialidades.
- Contraste reforçado em campos, rótulos, cartões, indicadores e superfícies escuras.
- Relatório reorganizado em páginas horizontais no formato de apresentação 16:9.
- Impressão em PDF disponível em 16:9 e A4 horizontal.
- Preservadas as rotinas existentes de avaliação, cálculo de maturidade, evidências, alertas, benchmarks e exportação protegida.


## v1.0.7 — correção de impressão e relatório

- Texto do relatório simplificado para “Esta é uma análise preliminar da empresa.”
- Corrigidas regras de impressão que podiam cortar conteúdo por altura fixa e overflow oculto.
- Ver diagnóstico técnico em `CHANGELOG-1.0.7.md`.


## v1.0.8 — Relatório A4 vertical
- Formato A4 vertical definitivo, com paginação automática e fluxo contínuo.
- Consulte `CHANGELOG-1.0.8.md` para as alterações e limites de validação.


## v1.0.8 — Relatório A4 vertical
- Formato A4 vertical definitivo, com paginação automática e fluxo contínuo.
- Tokens de cor e espaçamento consolidados em um único bloco CSS.
- Consulte `CHANGELOG-1.0.8.md` para o diagnóstico e limites de validação.
