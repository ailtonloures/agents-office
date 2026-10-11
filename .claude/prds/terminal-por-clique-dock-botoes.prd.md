# PRD — Terminal por clique no Tech Lead, dock configurável e botões presos ao escritório

## Problem Statement

O terminal do Claude Code dentro da interface funciona bem, mas está preso embaixo da tela e só abre por um caminho indireto: clicar no Tech Lead abre um diálogo e é preciso apertar uma tecla para abrir o terminal. Quando o terminal está aberto embaixo, os botões Hooks e Sessões ficam por cima dele em vez de acompanhar a área do escritório. O usuário também não consegue dividir a tela entre o escritório e os terminais de outra forma (lateral).

## Solution

Clicar num Tech Lead cuja sessão foi iniciada dentro do Agents Office abre (ou ativa) direto o terminal dessa sessão. Se a sessão foi iniciada fora do Agents Office, o clique abre só o diálogo, como hoje. Clicar em espaço vazio do escritório, ou em um personagem que não seja Tech Lead, minimiza o terminal. Clicar em outro Tech Lead com terminal interno troca para o terminal dele. O painel de terminais pode ser encaixado embaixo, à esquerda ou à direita, dividindo a tela com o escritório. Os botões Hooks e Sessões passam a viver dentro da área do escritório e se movem junto quando o painel muda de tamanho ou de lado.

## User Stories

1. Como usuário, quero clicar num Tech Lead e ver o terminal da sessão dele abrir, para trabalhar na sessão sem passar por um diálogo.
2. Como usuário, quero que o clique num Tech Lead com sessão iniciada dentro do Agents Office abra o terminal direto, para ter acesso imediato.
3. Como usuário, quero que o clique num Tech Lead cuja sessão roda fora do Agents Office abra apenas o diálogo, para não ver um terminal que não existe.
4. Como usuário, quero clicar em outro Tech Lead e ver o terminal dele, para alternar entre sessões pelo escritório.
5. Como usuário, quero clicar em espaço vazio e ver o terminal minimizar, para recuperar a visão do escritório rapidamente.
6. Como usuário, quero que clicar em um sub-agente ou outro personagem que não seja Tech Lead também minimize o terminal, para ter um comportamento previsível.
7. Como usuário, quero que o terminal minimizado continue com as abas e as sessões vivas, para retomar de onde parei.
8. Como usuário, quero que o terminal receba o foco do teclado ao abrir por clique, para digitar sem outro clique.
9. Como usuário, quero que o teclado volte ao escritório ao minimizar o terminal, para andar com o personagem.
10. Como usuário, quero que, se a aba do Tech Lead já foi fechada, o clique mostre o diálogo com o aviso de terminal fechado, para entender o que houve.
11. Como usuário, quero continuar acessando o diálogo de um Tech Lead pelo teclado (tecla de ação na frente do personagem), para ler as informações dele mesmo com terminal interno.
12. Como usuário, quero que um clique com o diálogo ou a ajuda abertos só feche essas telas, sem minimizar o terminal, para não perder o contexto.
13. Como usuário, quero encaixar o painel de terminais embaixo, à esquerda ou à direita, para dividir a tela do jeito que prefiro.
14. Como usuário, quero um seletor de posição na barra do painel, para trocar de lado sem abrir configurações.
15. Como usuário, quero redimensionar o painel arrastando sua borda, em qualquer lado, para dar mais espaço ao terminal ou ao escritório.
16. Como usuário, quero que o escritório nunca fique menor que um tamanho mínimo, para não perdê-lo ao ampliar o terminal.
17. Como usuário, quero que o escritório se redimensione e recalcule o zoom ao mudar o painel de lado ou de tamanho, para ver a imagem nítida.
18. Como usuário, quero que o xterm se ajuste (colunas e linhas) ao novo tamanho do painel, para o texto não ficar cortado.
19. Como usuário, quero que a posição e o tamanho do painel sejam lembrados ao reabrir o app, para não reconfigurar.
20. Como usuário, quero que o painel minimizado ocupe só uma faixa fina no lado escolhido, para manter o escritório grande.
21. Como usuário, quero expandir o painel minimizado pela faixa ou pelo atalho de teclado existente, para reabri-lo sem usar o mouse no escritório.
22. Como usuário, quero que os botões Hooks e Sessões fiquem dentro da área do escritório, para que nunca cubram o terminal.
23. Como usuário, quero que esses botões subam, desçam ou se desloquem junto com a área do escritório quando o painel muda, para estarem sempre visíveis.
24. Como usuário, quero que os botões de zoom continuem no canto da área do escritório, para manter o comportamento atual.
25. Como usuário, quero que o aviso de instalação de hooks também acompanhe a área do escritório, para não ficar escondido atrás do terminal.
26. Como usuário, quero que o indicador de foco do terminal continue funcionando em qualquer posição do painel, para saber quem recebe o teclado.
27. Como usuário em navegador comum (sem o app desktop), quero que nada disso quebre o escritório, para continuar usando a versão web.
28. Como desenvolvedor, quero a regra de decisão do clique isolada e testável, para evitar regressões.
29. Como desenvolvedor, quero o modelo do painel (posição, tamanho, colapso) puro e testado, para mudar o layout com segurança.

## Implementation Decisions

- "Sessão iniciada dentro do Agents Office" significa uma sessão com terminal associado (o modelo já guarda o vínculo entre sessão e terminal). Sessões sem vínculo são tratadas como externas.
- O clique num personagem passa por uma decisão única, com três saídas: abrir o terminal da sessão; abrir o diálogo; minimizar o terminal. A regra: Tech Lead com terminal vinculado e aba existente abre o terminal; Tech Lead externo, sem vínculo ou com aba já fechada abre o diálogo; qualquer outro alvo (espaço vazio ou personagem que não é Tech Lead) minimiza.
- Cliques que fecham diálogo ou ajuda continuam só fechando essas telas.
- A ponte entre a cena e o painel ganha uma ação de minimizar, ao lado da ação já existente de abrir o terminal de uma sessão. Ambas ficam disponíveis apenas no app desktop.
- O foco do teclado após abrir por clique deve terminar no terminal, mesmo com o clique no canvas devolvendo o teclado ao jogo; a ordem desses efeitos precisa ser garantida.
- O acesso ao diálogo de um Tech Lead com terminal interno é mantido pela tecla de ação do teclado.
- O modelo do painel passa a guardar a posição (embaixo, esquerda, direita) e a largura, além da altura e do colapso atuais, tudo persistido no armazenamento local existente. Valores antigos persistidos sem posição assumem "embaixo".
- O espaço ocupado pelo painel é calculado conforme a posição: altura quando embaixo, largura quando lateral. Minimizado, ocupa uma faixa fixa fina no lado escolhido.
- O layout da página alterna entre coluna (embaixo) e linha (laterais), com o painel antes ou depois do escritório conforme o lado. A área do escritório continua sendo o contêiner que o jogo mede; o zoom e o redimensionamento do Phaser seguem o tamanho dessa área sem mudar o cálculo.
- O arraste da borda de redimensionamento usa o eixo certo para cada posição e respeita um tamanho mínimo para o escritório em altura e em largura.
- Os botões Hooks e Sessões, o aviso de instalação de hooks e demais controles do escritório passam a ser filhos da área do escritório com posicionamento absoluto, seguindo o padrão dos botões de zoom. Os módulos que os criam recebem o contêiner do escritório.
- Sem mudanças em contratos de eventos, API do daemon ou ponte do terminal.

## Testing Decisions

- Um bom teste verifica comportamento externo (decisão resultante, tamanho ocupado, posição persistida, elementos dentro do contêiner), não detalhes de implementação.
- Modelo do painel: posição, limites de largura e altura, tamanho ocupado por posição, colapso e migração de valores persistidos antigos. Arte prévia: testes unitários existentes do modelo de abas.
- Decisão de clique: função pura coberta por tabela de casos (TL interno, TL externo, sem vínculo, aba fechada, não-TL, vazio, diálogo aberto). Arte prévia: testes de conteúdo de diálogo e de vínculo de sessão.
- E2E (Playwright, alimentador de eventos existente): botões Hooks e Sessões dentro da área do escritório e sem sobrepor o painel em cada posição; clique em vazio minimiza; troca de posição redimensiona o escritório. Arte prévia: `office.spec.ts`. Observação: o painel só existe no app desktop, então os casos que dependem dele usam a simulação da ponte já usada nos testes ou ficam restritos ao unitário.

## Out of Scope

- Dividir o painel em vários terminais visíveis ao mesmo tempo (grade de terminais).
- Janelas de terminal flutuantes ou destacáveis.
- Mover o terminal para fora da janela do app.
- Clicar para andar (o personagem continua pelo teclado).
- Mudar o comportamento de abas, ciclo de vida de sessões ou limite de sessões.

## Further Notes

- Os botões Hooks e Sessões hoje usam posicionamento fixo na janela, motivo de cobrirem o terminal.
- Em navegador comum não há painel nem ações desktop: o clique no Tech Lead continua abrindo só o diálogo.
- Recomenda-se entregar em etapas independentes: botões presos ao escritório, modelo de posição, regra de clique, e por fim a interface de posição com redimensionamento e E2E.
