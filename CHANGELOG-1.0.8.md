# v1.0.8 — Relatório A4 vertical e consolidação de tokens

## Alterações
- A4 vertical passa a ser o único formato de exportação do relatório.
- Removida a escolha de apresentação 16:9/A4 paisagem da tela do relatório.
- Relatório impresso flui continuamente entre páginas; não força uma página para cada seção.
- Removidas alturas mínimas de tela, rodapés repetidos por seção e quebras de página forçadas na impressão.
- Ajustados KPIs e quadros de contexto para duas colunas no papel A4 vertical.
- Tabelas usam a largura disponível, repetem o cabeçalho quando suportado pelo navegador e evitam dividir linhas.
- Margens, tipografia e espaçamentos ajustados para leitura, sem reduzir excessivamente o texto.
- Consolidado o conjunto de variáveis CSS (`:root`) em uma única declaração, eliminando três camadas concorrentes de tokens de cor e espaçamento.
- Mantido o texto: “Esta é uma análise preliminar da empresa.”

## Diagnóstico confirmado na v1.0.7
- A folha CSS continha três blocos `:root` de versões diferentes (v3.0, v3.1 e v1.0.6), redefinindo as mesmas variáveis.
- A impressão estava em A4 paisagem e aplicava `break-after: page` a cada seção do relatório. Se uma seção ultrapassasse uma página, o conteúdo continuava e a quebra forçada seguinte criava paginação irregular.
- O relatório de tela também usava `min-height: 660px`, mantendo aparência de slides horizontais em vez de documento vertical.
- Havia um único bloco `@media print` na v1.0.7; portanto, o problema não era a quantidade de blocos de impressão, mas suas regras de paginação e o modelo de slides.
- Ainda existem ajustes de componentes específicos acumulados no CSS. A consolidação integral desses seletores exige uma revisão separada para não alterar inadvertidamente o comportamento do aplicativo.

## Preservação
- Nenhuma pergunta, regra de cálculo, dado, resposta ou funcionalidade da avaliação foi removida.
- A versão 1.0.7 permanece preservada como base anterior.

## Validação executada
- `node --check js/app.js`: aprovado.
- `package.json`: JSON válido.
- Integridade do ZIP: aprovada.
- Inspeção estática: um único bloco de variáveis `:root`, um único bloco de impressão, A4 portrait, sem quebra forçada por seção e sem `overflow:hidden` nas regras de impressão.
- A renderização visual/PDF completa com avaliação real não pôde ser concluída neste ambiente; não é declarada como validada. Recomenda-se conferir o primeiro PDF gerado em Chrome/Edge com uma avaliação preenchida.
