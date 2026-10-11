---
title: Zoom in/out do escritório (Ctrl+scroll e botões + / −)
status: ready-for-agent
labels: [ready-for-agent, needs-spec]
created: 2026-10-11
related: [agents-office.prd.md]
---

# PRD: Zoom do escritório

## Problem Statement
O usuário só consegue ver o escritório em um nível de ampliação fixo (mais a visão geral da tecla `M`). Em telas grandes os personagens ficam pequenos; em telas pequenas, o mapa visível é curto. Não há como aproximar para ler detalhes nem afastar para ver mais salas sem entrar no modo de visão geral, que esconde o HUD e para de seguir o avatar.

## Solution
O usuário passa a poder aproximar e afastar o escritório de duas formas: segurando Ctrl e girando a roda do mouse sobre o jogo, ou clicando em dois botões "+" e "−" no canto inferior direito. O zoom afeta somente o escritório (mapa e personagens); HUD, diálogos e painéis mantêm o tamanho. O nível escolhido é lembrado entre sessões e a câmera continua seguindo o avatar.

## User Stories
1. Como usuário, quero aproximar o escritório com Ctrl + roda do mouse, para ver os personagens com mais detalhe.
2. Como usuário, quero afastar o escritório com Ctrl + roda do mouse, para ver mais salas ao mesmo tempo.
3. Como usuário, quero um botão "+" na tela, para aproximar sem depender de teclado ou roda.
4. Como usuário, quero um botão "−" na tela, para afastar sem depender de teclado ou roda.
5. Como usuário de trackpad ou mouse sem roda, quero usar os botões, para ter zoom sem Ctrl + scroll.
6. Como usuário, quero que cada passo de zoom seja pequeno e previsível, para não perder a referência da cena.
7. Como usuário, quero que o zoom tenha um mínimo e um máximo, para não afastar até o mapa sumir nem aproximar até ficar ilegível.
8. Como usuário, quero que o botão "+" fique desabilitado no zoom máximo, para saber que cheguei ao limite.
9. Como usuário, quero que o botão "−" fique desabilitado no zoom mínimo, para saber que cheguei ao limite.
10. Como usuário, quero que o HUD, os diálogos e a barra de prompt não mudem de tamanho com o zoom, para continuarem legíveis.
11. Como usuário, quero que a câmera continue seguindo meu avatar durante o zoom, para não me perder no mapa.
12. Como usuário, quero que o nível de zoom seja lembrado ao recarregar, para não reajustar toda vez.
13. Como usuário, quero que Ctrl + roda não dê zoom na página do navegador sobre o jogo, para o zoom afetar apenas o escritório.
14. Como usuário do app desktop, quero o mesmo comportamento de Ctrl + roda e botões, para ter paridade com a versão web.
15. Como usuário, quero que Ctrl + roda sobre o painel de terminal não mude o zoom do escritório, para não atrapalhar o uso do terminal.
16. Como usuário, quero que a roda do mouse sem Ctrl continue com o comportamento atual, para não alterar o zoom sem querer.
17. Como usuário, quero que clicar nos botões de zoom não mova o avatar nem dispare ações no jogo, para o clique ser só de zoom.
18. Como usuário, quero que a visão geral (`M`) continue funcionando, para ver o prédio inteiro.
19. Como usuário, quero que, ao sair da visão geral, o zoom volte ao nível que eu tinha escolhido, para não perder meu ajuste.
20. Como usuário, quero que os botões fiquem ocultos ou inativos na visão geral, para não haver zoom conflitante.
21. Como usuário, quero que os botões acompanhem o canto da tela ao redimensionar a janela, para ficarem sempre acessíveis.
22. Como usuário, quero que os botões tenham o mesmo estilo dos demais botões da interface, para uma aparência consistente.
23. Como usuário, quero que o zoom se mantenha nítido (pixel art), para a imagem não ficar borrada.
24. Como usuário, quero que um valor inválido salvo no navegador seja ignorado, para o app nunca abrir com zoom quebrado.
25. Como mantenedor, quero a regra de limites e passos isolada e testada, para evoluir sem regressões.
26. Como mantenedor, quero o nível de zoom exposto no estado de depuração, para escrever testes E2E.

## Implementation Decisions
- Zoom aplicado na câmera do jogo, não na viewport: elementos fixos na tela (HUD, diálogo, prompt) não escalam.
- Módulo de lógica pura de zoom: limites (0,5× a 3×), passo de 0,25×, valor padrão 1×, função de passo (aproximar/afastar com arredondamento ao passo e clamp), interpretação da direção da roda e leitura/escrita do valor persistido com validação.
- Gesto: roda com Ctrl pressionado; sem Ctrl, nada muda. O evento é cancelado para impedir o zoom nativo do navegador sobre o canvas. Eventos fora da área do jogo (ex.: painel de terminal) não são tratados.
- Botões "+" e "−" em DOM, no canto inferior direito da área do jogo, usando o estilo compartilhado de botões, com identificadores de teste; desabilitam nos limites e ficam inativos/ocultos na visão geral.
- Os botões se comunicam com a cena por um evento do jogo; cliques neles não chegam ao canvas.
- Persistência por navegador via armazenamento local com chave namespaced, tolerante a falha de acesso e a valores inválidos (cai no padrão).
- Visão geral: ao sair, restaura o zoom escolhido pelo usuário em vez de 1×. Zoom de usuário é ignorado enquanto a visão geral está ativa.
- O nível atual é publicado no estado de depuração para os testes E2E.

## Testing Decisions
- Bom teste: verifica comportamento observável (nível resultante, botões habilitados, valor persistido), sem depender de detalhes internos da cena.
- Seam 1 (unitário): módulo de zoom — clamp, passo, arredondamento, direção da roda, persistência e valor inválido. Prior art: teste de escala da viewport.
- Seam 2 (E2E Playwright, mais alto): clicar nos botões e Ctrl + roda sobre o canvas, conferindo o zoom no estado de depuração, limites, persistência após recarregar e retorno da visão geral. Prior art: testes E2E do escritório.
- Verificação manual no app desktop (Electron) de que Ctrl + roda não aciona zoom nativo.

## Out of Scope
- Zoom da interface inteira (HUD, painéis, terminal).
- Atalhos de teclado para zoom (Ctrl + "+" / "−" / "0").
- Arrastar para mover a câmera (pan) e zoom centrado no cursor.
- Pinça (pinch) em telas touch.
- Alterações no zoom inteiro da viewport e no cálculo da visão geral.

## Further Notes
Atalhos de teclado e zoom no cursor podem virar um PRD futuro. O terminal embutido já interpreta combinações com Ctrl, então qualquer atalho novo deve ser avaliado contra elas.
