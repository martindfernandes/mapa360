# Mapeamento 360 Autoavaliação — v1.0.5

- Corrigido o fluxo de abertura do relatório executivo: a navegação agora localiza a etapa pelo identificador `relatorio`, renderiza a tela e confirma que o documento foi montado.
- A geração do relatório passou a tratar erros de montagem e exibir o detalhe técnico na própria tela, em vez de falhar silenciosamente.
- A impressão sempre força a montagem da etapa do relatório antes de procurar o documento a imprimir.
- O botão **Salvar app completo com Dados** também está disponível diretamente no painel de resultado/maturidade, além da tela de relatório e configurações.
- Corrigido erro que interrompia a renderização do relatório: `renderReportDoc()` utilizava a variável `target` sem declará-la no próprio escopo. Agora a meta de referência é lida da avaliação antes de montar os gráficos e indicadores.
