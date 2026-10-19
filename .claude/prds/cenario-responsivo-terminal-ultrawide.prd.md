---
title: Cenário responsivo - sem esticar ao abrir o terminal e preenchendo telas ultra wide
status: ready-for-agent
labels: [ready-for-agent, needs-spec]
created: 2026-10-18
related: [zoom-escritorio.prd.md]
---

# PRD: Cenário responsivo (terminal e ultra wide)

## Problem Statement
Ao abrir o terminal acoplado, o cenário do escritório aparece **esticado** e só volta ao normal quando o usuário move ou redimensiona o terminal. A correção anterior (zoom fixo e âncora no canto superior esquerdo) melhorou o gráfico, mas a quebra continua e estraga a experiência: o usuário precisa "mexer" na interface para consertar o que acabou de abrir.

Em telas **ultra wide** (por exemplo 3440x1440 ou 5120x1440) o prédio (32 a 64 tiles de largura) é menor que a janela. Hoje ele fica ancorado à esquerda com uma faixa escura vazia à direita; antes da correção anterior ficava no meio da tela. Nenhum dos dois resultados é bom: o cenário deveria usar a tela inteira. As barras de informação do topo (status à esquerda, atalhos à direita) também precisam acompanhar a largura real da área do jogo em qualquer resolução.

## Solution
O cenário passa a ser sempre desenhado no tamanho exato da área disponível, **no mesmo quadro** em que o terminal abre, fecha, muda de doca ou é redimensionado. Nunca aparece um quadro esticado nem é preciso mover o terminal para corrigir.

Em telas largas, o espaço além do prédio é preenchido com um **chão/fundo decorativo** contínuo, de modo que a tela inteira mostra cenário (sem faixa escura vazia). O zoom inteiro continua o mesmo, então o pixel art segue nítido e o prédio continua ancorado onde está. As barras do HUD ficam nos cantos (status no canto superior esquerdo, atalhos no canto superior direito) e sempre seguem a largura real do canvas, inclusive com o terminal aberto.

## User Stories
1. Como usuário, quero abrir o terminal e ver o cenário sem distorção no mesmo instante, para não precisar mover o terminal para "consertar" a tela.
2. Como usuário, quero que o cenário não pisque nem apareça esticado por um quadro ao abrir o terminal, para a transição parecer sólida.
3. Como usuário, quero o mesmo comportamento ao fechar o terminal, para o cenário voltar ao tamanho cheio sem artefatos.
4. Como usuário, quero que o terminal acoplado embaixo, à esquerda ou à direita não deforme o cenário, para escolher a doca que preferir.
5. Como usuário, quero que recolher e expandir o terminal mantenha o cenário correto, para alternar entre ver mais ou menos do escritório.
6. Como usuário, quero arrastar a borda do terminal e ver o cenário acompanhar sem esticar, para ajustar o tamanho com confiança.
7. Como usuário, quero que o zoom do escritório não mude quando o terminal abre ou fecha, para os personagens manterem o tamanho.
8. Como usuário de monitor ultra wide, quero que o cenário preencha a largura inteira da janela, para não ver uma faixa escura vazia.
9. Como usuário de monitor ultra wide, quero que o prédio continue nítido em zoom inteiro, para o pixel art não ficar borrado.
10. Como usuário de monitor ultra wide, quero que o chão estendido combine com a paleta do prédio, para a tela parecer um só ambiente.
11. Como usuário, quero que o chão estendido fique sempre atrás do prédio e dos personagens, para não cobrir nada nem atrapalhar a interação.
12. Como usuário, quero que o chão estendido cubra a visão também quando a câmera acompanha o avatar até as bordas, para nunca aparecer fundo vazio.
13. Como usuário, quero que a visão geral (tecla `M`) continue centralizando o prédio, com o chão estendido ao redor, para ver o escritório inteiro.
14. Como usuário, quero que o zoom manual (Ctrl+scroll e botões) mantenha o chão cobrindo toda a visão, para afastar a câmera sem ver bordas.
15. Como usuário de monitor ultra wide, quero a barra de status no canto superior esquerdo, para achá-la sempre no mesmo lugar.
16. Como usuário de monitor ultra wide, quero a barra de atalhos no canto superior direito da área real do jogo, para ela não ficar no meio nem cortada.
17. Como usuário, quero que as barras do HUD sigam a nova largura quando o terminal abre na doca esquerda ou direita, para não ficarem escondidas atrás do terminal.
18. Como usuário de janela estreita, quero que o painel de atalhos se esconda quando não couber, para não sobrepor o status.
19. Como usuário, quero que os controles de canto (zoom, Hooks, Sessões) fiquem dentro da área do jogo, para o terminal nunca os cobrir.
20. Como usuário de tela HiDPI, quero o mesmo comportamento correto com devicePixelRatio maior que 1, para não depender do monitor.
21. Como usuário em laptop (1280x720 ou 1366x768), quero que nada mude para pior, para a melhoria de ultra wide não afetar telas comuns.
22. Como usuário, quero redimensionar a janela do app e ver o cenário se ajustar sem esticar, para trabalhar em qualquer tamanho.
23. Como usuário, quero mover a janela entre monitores de resoluções diferentes e ver o cenário se ajustar sozinho, para não reiniciar o app.
24. Como mantenedor, quero um teste puro que prove que abrir o terminal mantém o zoom e só reduz a área, para a regressão não voltar.
25. Como mantenedor, quero um teste puro do retângulo de chão para as resoluções 1920x1080, 3440x1440 e 5120x1440, para a cobertura ser garantida sem Phaser.
26. Como mantenedor, quero casos de largura extrema nos testes do HUD, para as barras não quebrarem em ultra wide nem em janelas estreitas.
27. Como mantenedor, quero o diagnóstico da causa do esticamento registrado em um learning, para o próximo ajuste não repetir o palpite.
28. Como mantenedor, quero o DESIGN.md atualizado com a ordem do resize e o chão estendido, para o comportamento ficar documentado.
29. Como mantenedor, quero um único observador de redimensionamento do contêiner do jogo, para não haver resizes duplicados.
30. Como mantenedor, quero que o chão estendido use um tile já existente (ou o gerador de skin, nunca os PNGs), para respeitar as regras de assets CC0.

## Implementation Decisions
- **Causa do esticamento (hipótese, a confirmar por reprodução antes de corrigir):** o terminal altera o layout do DOM de forma síncrona, mas o canvas só é redimensionado um ou dois quadros depois (observador do contêiner e quadro adicional do painel). Outros suspeitos: o ajuste de zoom emitir um evento de resize com o tamanho antigo antes do resize real; o tamanho CSS do canvas não ser reescrito quando o zoom do Phaser é 1; os limites da câmera dependerem do tamanho exibido da câmera, que varia conforme a ordem dos handlers. A primeira tarefa é reproduzir e registrar qual suspeito é real.
- **Pipeline de resize:** um único ponto aplica o resize na ordem: tamanho do jogo, zoom, depois tamanho CSS do canvas escrito explicitamente a partir do viewport (largura e altura lógicas vezes o zoom). O resultado é renderizado de forma síncrona logo em seguida, antes da pintura do navegador. O resize pedido pelo painel do terminal é aplicado no mesmo quadro, sem esperar o próximo. Continua valendo o salto quando nada mudou, porque redimensionar limpa o canvas.
- **Módulo de escala:** continua puro e sem Phaser. Ganha uma função que devolve o tamanho CSS exato do canvas para um viewport. O zoom continua vindo da janela inteira, nunca da área reduzida pelo terminal.
- **Cena do escritório:** ao receber o resize, o zoom do mundo e os limites da câmera são recalculados já com o tamanho novo da câmera, usando o tamanho lógico da visão e não o tamanho exibido da câmera. A câmera é recentralizada no avatar depois.
- **Chão estendido:** um novo módulo de lógica pura calcula o retângulo de mundo a cobrir: a união do prédio com a visão da câmera, mais uma margem para o seguimento suave. A cena mantém uma única superfície repetida atrás do prédio, abaixo da camada de chão, que apenas acompanha esse retângulo. É objeto de mundo, fora da câmera de interface. Usa tile existente do tileset, escurecido; se nenhum servir, o gerador de skin é editado e o arquivo novo entra na lista de licenças CC0.
- **Visão geral:** continua removendo os limites da câmera e centralizando o prédio; o chão estendido aparece ao redor.
- **Prédio ancorado:** mantém a decisão anterior de prédio no canto superior esquerdo com limites alargados até a visão; o espaço sobrando é o chão estendido.
- **HUD:** sem redesenho. As barras ficam nos cantos e continuam a usar a largura lógica do canvas, reposicionadas no evento de resize. Os controles de canto em DOM continuam posicionados de forma absoluta dentro do contêiner do jogo.
- **Observadores:** remover o segundo observador duplicado do contêiner do jogo.
- **Sem mudança de contratos:** nenhum schema compartilhado, evento ou API do daemon é alterado. Textos de interface não mudam, então não há chaves de i18n novas.

## Testing Decisions
- Um bom teste verifica comportamento externo observável (números de viewport, retângulo de chão, posição das barras), sem acessar detalhes de implementação, e é determinístico, sem relógio real nem Phaser.
- **Seams (confirmados):** (1) módulo de escala, com o caso "o terminal abre: zoom constante e área menor" e o tamanho CSS do canvas; (2) novo módulo puro de chão, para 1920x1080, 3440x1440, 5120x1440, terminal aberto e visão geral; (3) lógica do HUD, posição do painel de atalhos em larguras de 256 a 853.
- Cada teste é escrito e visto falhando antes do código (Red, Green, Refactor).
- O comportamento Phaser/DOM (sem esticar ao abrir o terminal, sem faixa vazia, barras no canto) é verificado manualmente com o Playwright MCP nas resoluções 1280x720, 1920x1080, 3440x1440 e 5120x1440, nas três docas e com arrastar, recolher e fechar. Isso não é testável antes por depender de Phaser, e o motivo será dito na entrega.
- **Prior art:** testes de escala (viewport por resolução e HiDPI), da lógica do HUD (posição do painel de atalhos), do layout das salas e do painel de abas do terminal, todos em vitest na pasta de testes do pacote web.

## Out of Scope
- Redesenhar o HUD (barra de largura total ou agrupamento no centro).
- Limitar ou aumentar o zoom automaticamente em telas largas.
- Adicionar novas salas, props ou arte além do chão estendido.
- Mudar o layout procedural do prédio ou o seguimento da câmera.
- Mudanças no daemon, no desktop (Electron) ou no CLI.
- Mudanças no pacote da landing.

## Further Notes
- A causa do esticamento é inferida da leitura do código (nada foi reproduzido ainda); o primeiro passo da implementação é a reprodução, registrada no learning existente sobre o flash de resize do canvas.
- O comportamento atual está descrito no DESIGN.md, seção 1.1; ele deve ser atualizado junto com a implementação.
- Quebra em partes: specs 116 (pipeline de resize), 117 (chão estendido), 118 (HUD e controles de canto) e 119 (documentação e verificação final).
