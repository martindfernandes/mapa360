# CHANGELOG — Mapeamento 360 Autoavaliação v1.1.0

## Módulos opcionais e seleção independente
- Diagnóstico geral permanece obrigatório.
- Perguntas do segmento, Ramo e produtos e PPCP passam a ser opcionais e selecionáveis independentemente do segmento principal.
- PPCP deixa de ser bloqueado para empresas de serviços, comércio ou outros segmentos; a empresa pode selecioná-lo quando fizer sentido para sua operação.
- Criados quatro módulos transversais, com 10 perguntas padrão cada: Automação de processos, Dados e BI, Processos administrativos e Gestão de projetos.
- Removidos os avisos de módulos em desenvolvimento.
- Resultados e relatório passam a exibir dimensões dos módulos selecionados.
- Respostas de módulos desativados ficam arquivadas e retornam ao cálculo quando o módulo for reativado.
- Comparação com avaliação anterior sinaliza diferenças de módulos e apresenta somente dimensões comuns.
- Avaliações antigas sem a nova configuração de módulos preservam o comportamento anterior na migração.

## Versões
- Aplicativo: 1.1.0
- Instrumento: 3.2.0

## Observações de validação
- Alteração de conteúdo e regras de seleção aplicada sobre a base 1.0.9-netlify-fix.
- Integrações reais Supabase/Resend e publicação Cloudflare não foram alteradas nem testadas nesta entrega.
