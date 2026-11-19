# Revisão técnica — Mapeamento 360 v3.1.1

## Evolução aplicada
- Preservada a arquitetura estática anterior: HTML, CSS e JavaScript separados.
- Mantidos os identificadores de armazenamento da v3 para preservar avaliações existentes; novos campos são aditivos e têm valores padrão na migração/leitura de registros antigos.
- Adicionado catálogo configurável no JavaScript para ramos, produtos, modelos de negócio e especialidades.
- Seleções múltiplas são armazenadas em arrays no contexto da avaliação, renderizadas como chips e removidas individualmente.
- Inclusão de produtos personalizados e ramos personalizados.
- Perguntas contextuais são calculadas a partir dos ramos e produtos selecionados. As respostas de perguntas contextuais usam IDs estáveis e são preservadas no backup JSON.
- Relatório inclui contexto operacional e frentes consultivas a aprofundar, sem tratar respostas não verificadas como fatos.
- Removido o atalho e todas as referências específicas a uma empresa cliente.
- Mantida a exportação/importação de backup `.m360enc` com AES-256-GCM e PBKDF2-SHA-256 (600.000 iterações).
- A cópia completa HTML contém o aplicativo e os dados criptografados com senha definida pelo usuário (v1.0.4).
- Renovada a paleta visual e adicionados estilos responsivos para seletores, chips e relatório.

## Compatibilidade
- Avaliações anteriores sem os campos novos continuam sendo lidas: os arrays e campos ausentes recebem valores vazios.
- Os dados permanecem locais no navegador. Exportar/importar backup continua sendo o mecanismo de transporte entre dispositivos.
- Não houve mudança para backend nem adição de envio remoto de dados.
- A cópia completa exige execução em localhost ou HTTPS para incorporar CSS e JavaScript. O arquivo resultante é independente e pede senha antes de descriptografar o app e os dados.

## Verificações executadas
- `node --check js/app.js`: sintaxe JavaScript validada.
- Verificação de IDs duplicados no HTML.
- Verificação de atributos de evento inline no HTML.
- Revisão estática das rotas de seleção, inclusão, remoção, persistência e geração do relatório.

## Limitações e recomendações
- O catálogo inicial é uma base editável, não uma taxonomia industrial exaustiva. Expandir com a experiência das entrevistas.
- As perguntas de ramo/produto são instrumentos de investigação; devem ser refinadas com especialistas e validadas em aplicações reais.
- A escala 1–5 e os pesos permanecem metodologia própria/preliminar, sem validação estatística.
- A aplicação ainda não tem autenticação, autorização, backend, criptografia automática do armazenamento local ou sincronização entre usuários.
- A cópia completa agora exige senha definida pelo usuário com pelo menos 12 caracteres; a senha não é embutida nem exibida pelo aplicativo. Compartilhar a senha por canal separado do HTML.
- A validação de sintaxe foi executada. O teste visual automatizado em Chromium não pôde ser concluído neste ambiente; validar no navegador de uso antes de aplicar com dados reais.
- Não foi realizado pentest, teste em dispositivos físicos Android/iOS ou validação de acessibilidade por ferramenta especializada.

- v1.0.4: acesso direto ao relatório a partir do dashboard, impressão restrita ao relatório e exportação HTML independente com os dados criptografados.


## Revisão v1.0.6
- Nova identidade visual Industrial Executivo e reforço de contraste.
- Ação de exportação do app completo reposicionada no cabeçalho, ao lado da versão.
- Relatório estruturado em seções horizontais e impressão em 16:9 ou A4 paisagem.
- Sintaxe e integridade do pacote devem ser verificadas após a edição.


## Revisão v1.0.7

Foi identificado acúmulo de camadas visuais de versões diferentes e regras de impressão concorrentes. A camada final de impressão foi substituída por fluxo natural, sem altura fixa e sem recorte por overflow oculto. A v1.0.6 não havia concluído um redesign estrutural do aplicativo; havia aplicado principalmente uma camada de identidade visual. A reorganização integral do CSS e do layout do app permanece como etapa separada, para evitar novos remendos.
