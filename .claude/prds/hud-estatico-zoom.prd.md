# PRD — HUD estático durante o zoom do escritório

## Problem Statement

Com o zoom do escritório (Ctrl + roda e botões + / −), as barras de informação do jogo — o pill "sessões · agentes · sala ativa", a barra de atalhos no topo e o painel de dicas na parte inferior — são ampliadas e reduzidas junto com o escritório. No zoom in elas crescem e saem do lugar; no zoom out encolhem. O usuário espera que apenas o escritório se mova: a interface deve ficar parada e legível em qualquer nível de zoom.

## Solution

Todo elemento de interface fixo na tela (barra de status, atalhos, painel de dicas, diálogos, painel de ajuda, avisos e vinheta) passa a ser desenhado por uma câmera própria, que nunca aplica zoom. A câmera principal continua responsável só pelo mundo (zoom, seguir o avatar, limites). Assim o HUD mantém tamanho e posição idênticos em qualquer zoom, inclusive ao redimensionar a janela.

## User Stories

1. Como usuário, quero que o pill de sessões e agentes mantenha o tamanho ao dar zoom in, para lê-lo sempre com o mesmo conforto.
2. Como usuário, quero que o pill de sessões e agentes mantenha o tamanho ao dar zoom out, para que não fique minúsculo.
3. Como usuário, quero que o pill permaneça no canto superior esquerdo em qualquer zoom, para encontrá-lo sempre no mesmo lugar.
4. Como usuário, quero que a barra de atalhos permaneça no canto superior direito com o mesmo tamanho, para consultá-la sem procurar.
5. Como usuário, quero que o painel de dicas inferior permaneça com o mesmo tamanho e posição, para que o zoom não o esconda nem o corte.
6. Como usuário, quero que o indicador de sala ativa não se mova com o zoom, para saber onde estou sem reajustar a leitura.
7. Como usuário, quero que o contador de pendências (`!`) continue piscando no mesmo lugar e tamanho, para não perder um alerta ao dar zoom.
8. Como usuário, quero que a caixa de diálogo tenha tamanho fixo ao dar zoom, para interagir com os personagens da mesma forma em qualquer nível.
9. Como usuário, quero que o painel de ajuda tenha tamanho fixo, para lê-lo sem depender do zoom.
10. Como usuário, quero que avisos (toast) mantenham tamanho e posição, para vê-los mesmo muito ampliado.
11. Como usuário, quero que a vinheta cubra sempre a tela inteira, para que o zoom out não revele bordas.
12. Como usuário, quero que apenas o escritório (salas, móveis, personagens, nomes) se amplie e reduza, para ter a sensação de câmera e não de zoom da página.
13. Como usuário, quero que os botões + / − continuem no canto inferior direito, sem se sobrepor ao painel de dicas.
14. Como usuário, quero que o zoom por Ctrl + roda e pelos botões continue funcionando como antes, sem regressões.
15. Como usuário, quero que o nível de zoom persista após recarregar, como já ocorre.
16. Como usuário, quero que o HUD se reposicione ao redimensionar a janela em qualquer zoom, para usar telas de tamanhos diferentes.
17. Como usuário, quero que a visão geral (`M`) continue funcionando e volte ao zoom escolhido, sem alterar o HUD.
18. Como usuário, quero que cliques e movimentos do avatar continuem a funcionar em qualquer zoom, para que a mudança de renderização não afete o jogo.
19. Como usuário do app desktop, quero o mesmo comportamento do navegador.
20. Como desenvolvedor, quero um teste E2E que compare o HUD em zooms diferentes, para evitar regressões.
21. Como desenvolvedor, quero que novos elementos de interface sigam uma regra única de "camada de UI", para que nenhum volte a escalar com o zoom.
22. Como desenvolvedor, quero que a decisão fique registrada em `.claude/learnings`, para lembrar que scroll factor 0 não impede o zoom da câmera.

## Implementation Decisions

- A cena do escritório ganha uma câmera de UI fixa em zoom 1, do tamanho da tela, e uma camada de UI que agrupa todos os elementos fixos na tela.
- A câmera principal ignora a camada de UI. A câmera de UI ignora todo objeto que não seja da camada de UI, inclusive objetos criados depois (personagens, props, iluminação), via o evento de adição à cena.
- Entram na camada: barra de status, atalhos, painel de dicas, diálogo, painel de ajuda, aviso e vinheta. Os módulos de UI recebem a camada (ou uma função de registro) na construção; a profundidade atual continua definindo a ordem dentro da camada.
- Ao redimensionar, a câmera de UI acompanha o novo tamanho junto com os `layout` existentes.
- O comportamento da visão geral (HUD oculto) não muda neste PRD.
- Câmera principal, zoom, limites, seguir o avatar e os eventos de zoom ficam como estão.
- Nenhuma dependência nova.

## Testing Decisions

- Um bom teste verifica comportamento externo: o tamanho e a posição do HUD na tela não mudam com o zoom; não testa detalhes de câmeras do Phaser.
- E2E (já existente, `window.__office`): em zoom 0,5, 1 e 3, o tamanho e a posição do HUD, da barra de dicas e do diálogo são idênticos; o zoom do mundo continua mudando. Se necessário, o estado de depuração expõe os limites do HUD.
- Unitário: qualquer lógica pura nova (por exemplo, decidir o que pertence à camada de UI), no padrão de `zoomControls.test.ts`.
- Arte prévia: os testes de zoom do E2E e `zoom.test.ts`.

## Out of Scope

- Mostrar o HUD na visão geral (`M`).
- Mudar níveis, passos ou limites do zoom.
- Redesenho visual do HUD, dos botões ou do diálogo.
- Zoom por gesto de pinça em toque.

## Further Notes

- Causa: `setScrollFactor(0)` fixa a posição, mas não impede que o zoom da câmera escale o objeto.
- Verificar visualmente a nitidez do texto bitmap e que o mundo não seja desenhado duas vezes.
- Fluxo: este PRD → spec 035.
