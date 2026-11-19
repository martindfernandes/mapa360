# v1.0.7

## Correções
- Texto de apresentação da natureza do relatório simplificado para: “Esta é uma análise preliminar da empresa.”
- Removidas regras de impressão duplicadas e conflitantes.
- Removidas alturas fixas de página e `overflow:hidden` no relatório impresso, que podiam cortar conteúdo.
- Impressão passa a usar fluxo natural do documento, permitindo que blocos extensos continuem em páginas seguintes.
- Tabelas passam a poder ocupar a largura disponível na impressão, sem largura mínima forçada.

## Diagnóstico técnico
- A folha de estilos acumulava regras de versões diferentes (base v3.0, camada visual v3.1, ajustes da Autoavaliação e v1.0.6), com múltiplas redefinições de variáveis e componentes.
- Havia regras `@media print` concorrentes. A última camada definia altura fixa, `overflow:hidden` e quebras forçadas, combinação capaz de recortar conteúdo.
- A v1.0.6 alterou principalmente paleta, contraste e alguns componentes; não realizou uma reformulação estrutural completa do layout do aplicativo. Portanto, não deve ser descrita como redesign concluído.

## Limitação de validação
- `node --check js/app.js` e validação de `package.json` aprovados.
- A impressão precisa de conferência no navegador com dados reais e nos dois formatos. Não foi possível concluir a validação visual automatizada nesta execução.
