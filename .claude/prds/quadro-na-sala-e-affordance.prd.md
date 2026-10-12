---
title: Quadro Excalidraw dentro da sala e com affordance de clique
status: ready-for-agent
labels: [ready-for-agent]
created: 2026-10-12
related: [quadro-excalidraw.prd.md]
---

# PRD: Quadro dentro da sala e com affordance clara

## Problem Statement
O quadro que abre o Excalidraw aparece na parede do corredor, acima da sala do projeto, e não dentro dela. Isso o desconecta do workspace: o usuário não percebe que o quadro pertence àquele projeto. Além disso, nada no quadro indica que ele é clicável: a única pista é um destaque e um rótulo que só aparecem quando o mouse já está sobre ele, então muita gente nunca descobre a função.

## Solution
O quadro passa a ficar na parede de topo da própria sala do projeto, ao lado da porta e das janelas, e o ponto onde um agente fica para desenhar passa a ser dentro da sala. O quadro ganha sinais visuais permanentes de interatividade (selo flutuante e brilho discreto pulsante), um destaque mais forte no hover com rótulo claro e, ao chegar perto com o avatar, um prompt para abri-lo. Os sinais só aparecem no app desktop, onde o quadro funciona.

## User Stories
1. Como usuário, quero ver o quadro dentro da sala do projeto, para entender que ele pertence àquele workspace.
2. Como usuário com vários projetos, quero um quadro por sala, na mesma posição relativa, para encontrá-lo sem procurar.
3. Como usuário, quero que o quadro não fique mais no corredor, para o corredor não parecer ter objetos de outro projeto.
4. Como usuário, quero que o quadro não sobreponha a porta, a placa nem as janelas da sala, para a sala continuar organizada.
5. Como usuário, quero perceber de relance que o quadro é interativo, para não depender de passar o mouse por acaso.
6. Como usuário, quero um selo flutuante sobre o quadro, para ele chamar atenção sem poluir a cena.
7. Como usuário, quero um brilho discreto pulsante no quadro, para reforçar que ele é clicável.
8. Como usuário, quero que o sinal seja sutil e não distraia do trabalho dos agentes, para o escritório continuar agradável.
9. Como usuário, quero que o quadro ganhe contorno e cursor de mão ao passar o mouse, para confirmar que posso clicar.
10. Como usuário, quero um rótulo claro "Quadro — clique para desenhar" no hover, para saber o que acontece ao clicar.
11. Como usuário, quero clicar no quadro e abrir o Excalidraw do projeto, para desenhar e colaborar com os agentes.
12. Como usuário, quero que o clique no selo também abra o quadro, para a área clicável coincidir com o que vejo.
13. Como usuário, quero andar com o avatar até o quadro e ver um prompt de ação, para abri-lo sem mouse.
14. Como usuário, quero que o ponto de desenho dos agentes fique dentro da sala, para eles não saírem para o corredor ao desenhar.
15. Como usuário, quero chegar ao quadro a pé a partir da entrada, para o quadro nunca ficar bloqueado por móveis.
16. Como usuário do navegador puro, quero não ver selo nem brilho no quadro, para não ser induzido a clicar em algo que não funciona.
17. Como usuário, quero que o selo e o brilho sumam enquanto o painel do quadro está aberto, para não competirem com a tela de desenho.
18. Como usuário, quero que eles também sumam com ajuda, diálogo ou visão geral abertos, para a cena não ficar confusa.
19. Como usuário, quero que o selo e o quadro acompanhem o zoom do escritório e permaneçam nítidos, para manter a estética pixel art.
20. Como usuário, quero que salas existentes mudem sozinhas ao atualizar, sem perder o conteúdo desenhado, para não ter ação manual.
21. Como designer, quero que o skin continue gerado e CC0, para não editar PNGs nem violar a licença.
22. Como mantenedor, quero a lógica de animação do selo pura e testável, para não depender de Phaser nos testes.

## Implementation Decisions
- O quadro é posicionado na parede de topo da sala, no trecho de entrada, no slot hoje ocupado pelo quadro decorativo largo (mesma largura de 2 tiles), à direita da porta e à esquerda das janelas. Esse decor deixa de existir nas salas.
- O ponto de interesse do quadro passa a ser o primeiro tile de piso abaixo do quadro, dentro da sala, no mesmo critério usado pelo ponto de interesse da janela. O ponto antigo no corredor e o prop antigo no corredor são removidos. O decor restante do corredor (janelas, relógio ou pôster, plantas) fica.
- A associação quadro-sala continua por coluna da sala; o teste de clique continua usando a posição do prop e não depende de a linha estar no corredor.
- Nova lógica pura de affordance do quadro, com `now` injetado: calcula deslocamento vertical do selo (bob suave), alpha do brilho pulsante (mesmo padrão de pulso do destaque do Tech Lead) e visibilidade. Visível somente quando a ponte desktop existe, nenhum overlay (quadro, ajuda, diálogo, visão geral) está aberto.
- A cena desenha o selo e o brilho em runtime com Graphics e texto, acima dos props de parede e fora do UiOverlay (são objetos do mundo e seguem o zoom). Sem novo arquivo de skin; se um asset virar necessário, entra no gerador e em LICENSES.md.
- No hover, o destaque existente (tint e cursor de mão) é mantido, o brilho pulsante dá lugar ao contorno sólido, e o rótulo passa a "Quadro — clique para desenhar".
- Quando o avatar está no ponto de interesse do quadro, o HUD mostra o prompt "Abrir o quadro". Se já existir tecla de ação para pontos de interesse, ela dispara o mesmo evento de abertura usado pelo clique; caso contrário, fica apenas o prompt textual e isso é registrado em learning.
- A decisão de clique (`open-board` só no desktop) não muda.
- Atualizar DESIGN.md (quadro na parede da sala, affordance) e o learning do quadro Excalidraw, em pt-BR.

## Testing Decisions
- Bom teste verifica comportamento externo (posições no layout, valores calculados, decisões), não detalhes de implementação do Phaser. Não há teste de cena Phaser, como hoje.
- Layout: quadro e ponto de interesse dentro dos limites da sala, um por workspace, ponto alcançável a partir do spawn, sem sobreposição de props. Arte prévia: testes de `roomLayout`.
- Hit-test e spots do quadro com as novas coordenadas. Arte prévia: teste de `boardProp`.
- Lógica de affordance: bob, pulso e visibilidade determinísticos com `now` injetado, incluindo os casos sem desktop e com overlay aberto. Arte prévia: testes das lógicas `*Logic.ts`.
- Prompt do HUD para o quadro. Arte prévia: `hudLogic`.
- Verificação manual por screenshots (Playwright) com vários projetos e zooms.

## Out of Scope
- Mudar o comportamento do Excalidraw, a sincronização do quadro ou o formato dos arquivos.
- Mais de um quadro por sala.
- Affordance no navegador puro (o quadro não funciona lá).
- Novo skin ou novos assets de arte.
- Alterar o Hall da Fama.

## Further Notes
- Os testes de layout atuais devem ser ajustados, pois assumem o quadro no corredor.
- A distinção "board" (Hall da Fama) versus "whiteboard" (Excalidraw) no HUD deve ficar clara nos nomes novos.
