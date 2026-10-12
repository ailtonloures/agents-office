---
title: Seletor de idioma (locale) da interface
status: ready-for-agent
labels: [ready-for-agent]
created: 2026-10-12
related: []
---

# PRD: Seletor de idioma (locale) da interface

## Problem Statement
Toda a interface do Agents Office está escrita em português do Brasil, com os textos fixos dentro do código. Quem não lê português não consegue usar o app, e não existe nenhuma forma de trocar o idioma. O padrão atual também não é o mais comum para um público internacional.

## Solution
Um botão de idioma na barra de controles do canto inferior esquerdo, ao lado de Hooks, Sessões e Elenco. O idioma padrão passa a ser inglês, com opções Português (Brasil), English e Español. A escolha é salva e lembrada nas próximas aberturas. Ao escolher um idioma, a página recarrega e toda a interface aparece no idioma escolhido. O botão funciona tanto no app desktop quanto no navegador comum.

## User Stories
1. Como usuário, quero ver um botão de idioma na barra inferior ao lado de Hooks, Sessões e Elenco, para trocar o idioma sem procurar em menus.
2. Como usuário de primeira viagem, quero que a interface abra em inglês, para ter um padrão internacional.
3. Como usuário brasileiro, quero escolher Português (Brasil), para usar o app na minha língua.
4. Como usuário hispanofalante, quero escolher Español, para usar o app na minha língua.
5. Como usuário, quero ver o idioma atual indicado no botão (EN, PT ou ES), para saber em que idioma estou.
6. Como usuário, quero que o menu mostre cada idioma pelo seu próprio nome (Português, English, Español), para reconhecê-lo mesmo se a interface estiver numa língua que não entendo.
7. Como usuário, quero que o idioma escolhido seja lembrado ao reabrir o app, para não precisar escolher de novo.
8. Como usuário, quero que a troca recarregue a página e aplique o idioma em tudo de uma vez, para não ver telas misturando idiomas.
9. Como usuário, quero que o HUD, as dicas e os prompts apareçam no idioma escolhido.
10. Como usuário, quero que o painel de ajuda e os atalhos apareçam no idioma escolhido.
11. Como usuário, quero que os painéis de Hooks, Sessões e Elenco apareçam no idioma escolhido.
12. Como usuário, quero que os balões de diálogo dos personagens apareçam no idioma escolhido.
13. Como usuário, quero que o terminal, o navegador embutido e o quadro apareçam no idioma escolhido.
14. Como usuário, quero que mensagens de erro, confirmações e avisos de atualização apareçam no idioma escolhido.
15. Como usuário, quero que datas e horas sigam o formato do idioma escolhido, para lê-las naturalmente.
16. Como usuário, quero que o idioma da página (atributo `lang`) acompanhe a escolha, para acessibilidade e leitores de tela.
17. Como usuário com armazenamento bloqueado, quero que o app continue funcionando em inglês, para que a falta de persistência não quebre nada.
18. Como usuário, quero que um valor inválido salvo seja ignorado e volte ao inglês, para o app nunca quebrar por dado corrompido.
19. Como usuário, quero usar o botão no app desktop e no navegador comum, para ter a mesma experiência nos dois.
20. Como usuário de teclado, quero abrir o menu e escolher o idioma pelo teclado sem que o jogo capture as teclas, para usar o seletor sem mouse.
21. Como usuário, quero que o botão não cubra o terminal nem os outros controles, para continuar usando a tela inteira.
22. Como usuário, quero que o botão tenha o mesmo visual dos demais botões do canto, para a interface ser consistente.
23. Como usuário, quero que textos vindos do Claude Code (conteúdo de sessões, nomes de perfis que eu escrevi) não sejam traduzidos, para não perder informação.
24. Como desenvolvedor, quero um helper único de tradução com dicionários tipados, para o compilador acusar chave faltando em qualquer idioma.
25. Como desenvolvedor, quero que a lógica de idioma seja pura e testável sem navegador, para validar rápido.
26. Como desenvolvedor, quero adicionar um idioma novo criando só um dicionário e uma entrada na lista, para a extensão ser barata.
27. Como desenvolvedor, quero que os testes de interface fixem o idioma, para não ficarem frágeis.
28. Como mantenedor, quero que a regra de strings de interface esteja documentada, para novos textos já nascerem traduzíveis.

## Implementation Decisions
- Idiomas suportados: inglês (padrão e fonte de verdade das chaves), português do Brasil e espanhol. A lista de idiomas, com código e nome nativo, fica num módulo puro.
- O idioma escolhido é guardado no armazenamento local do navegador, com leitura e escrita protegidas por tratamento de erro e valor inválido tratado como padrão, no mesmo padrão do zoom. Não passa pelo processo principal do desktop nem por contratos do pacote shared.
- O idioma é lido uma vez na inicialização, antes de qualquer painel ser montado; trocar de idioma grava a escolha e recarrega a página. Não há re-renderização ao vivo.
- Um helper de tradução recebe uma chave e parâmetros opcionais de interpolação, devolve o texto no idioma ativo e cai para o inglês se a chave faltar.
- Dicionários tipados: o dicionário em inglês define o tipo; os de português e espanhol precisam satisfazê-lo, de modo que chave faltando quebre o typecheck.
- Formatação de data e hora passa por um helper que usa o idioma ativo, substituindo os usos fixos de pt-BR.
- O atributo de idioma do documento é ajustado na inicialização, e o HTML base deixa de declarar pt-BR fixo.
- O botão de idioma é um novo item na barra de controles do canto, montado por último, sem depender da ponte desktop. Abre um menu pequeno com as três opções e marca a atual. Usa o estilo compartilhado de botões e identificadores de teste estáveis.
- Enquanto o menu está focado o teclado do jogo fica liberado, seguindo a regra do dono explícito do teclado.
- A migração das strings cobre toda a interface web: HUD e dicas, ajuda e atalhos, zoom, Hooks, Sessões, Elenco, diálogos, terminal e abas, navegador embutido, quadro, esqueletos de diagramas, identidade, sessões perdidas, atualizações, abertura externa, cartões de aprovação, etiquetas e mensagens de personagens.
- Rótulos de profissões e permissões definidos no pacote shared e exibidos na interface são mapeados por identificador para chaves de tradução no web, sem tornar o shared dependente de idioma.
- Textos gerados só no processo principal do desktop (notificações, bandeja) ficam fora; ver Out of Scope.
- Todos os identificadores de teste atuais permanecem inalterados.
- Código, comentários e identificadores continuam em inglês; os documentos em `.claude/` continuam em pt-BR. A regra do CLAUDE.md muda de "strings de UI em pt-BR" para "strings de UI via helper de tradução, padrão inglês".

## Testing Decisions
- Um bom teste verifica comportamento externo (texto devolvido, valor persistido, itens do menu), não a estrutura interna dos dicionários.
- Seams, preferindo os existentes e os mais altos: módulos puros de lógica testados com vitest, sem Phaser nem DOM, com armazenamento simulado; e o e2e Playwright para a troca ponta a ponta.
- Módulos testados: lógica de idioma (padrão, leitura, escrita, valor inválido, armazenamento indisponível), helper de tradução (interpolação, fallback), paridade de chaves entre os três dicionários, formatação de data por idioma, e a lógica pura do menu.
- E2E: abre em inglês, troca para português e espanhol, recarrega e confere persistência e ausência de texto residual de outro idioma em painéis principais.
- Prior art: o teste do zoom (armazenamento simulado), os testes de lógica do HUD, de Hooks, do Elenco e do diálogo, hoje afirmando textos em pt-BR; passam a fixar o idioma ou afirmar o inglês.
- Verificação manual no app desktop empacotado.

## Out of Scope
- Re-renderização ao vivo sem recarregar.
- Detecção automática do idioma do sistema ou do navegador.
- Traduzir conteúdo gerado pelo usuário ou pelo Claude Code (nomes de perfis, mensagens de sessões, prompts).
- Traduzir notificações do sistema e a bandeja do processo principal do desktop (podem virar uma spec futura recebendo o idioma por IPC).
- Idiomas além de inglês, português do Brasil e espanhol; layouts da direita para a esquerda.
- Traduzir a documentação raiz do projeto e as mensagens de commit.

## Further Notes
- A migração é grande (cerca de 600 textos em cerca de 25 arquivos), por isso é dividida em specs por área, todas dependentes da infraestrutura.
- Cada spec de migração deve deixar o app compilando e com testes verdes, com o dicionário de inglês completo para o que foi migrado.
- A interface ficará em inglês por padrão, o que muda a primeira impressão de usuários atuais; a escolha salva é por navegador/perfil do app.
