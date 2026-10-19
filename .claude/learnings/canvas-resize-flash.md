# Canvas resize flash

- Setting `canvas.width/height` (what `game.scale.resize` ends up doing) clears the canvas. If that
  happens outside Phaser's render step, the browser can paint the empty canvas before the next
  Phaser frame: a visible flash.
- `main.ts` therefore (spec 044):
  1. skips the resize when `{zoom, width, height}` equals the last applied one (`viewportChanged`
     in `scale.ts`, pure and unit tested); equal values must never touch the canvas;
  2. after `setZoom` + `scale.resize` (scenes lay out on the `resize` event, which is emitted
     synchronously) calls `game.step(performance.now(), game.loop.delta)` (phaser 3.90:
     `step(time, delta)`), so the cleared canvas is redrawn before the browser paints;
  3. funnels `window` resize, the `ResizeObserver` on `#game` and the terminal panel `onLayout`
     through one `requestAnimationFrame`-coalesced scheduler: at most one real resize per frame.
- `window.__office.resizes` counts real canvas resizes; E2E uses it to assert "at most one per
  change" instead of inspecting frames.
- The scheduler uses rAF, so nothing resizes in a hidden tab until it becomes visible again.
- Terminal panel (spec 045): `layoutKey(model)` in `terminalTabs.ts` (dock|axis|size|min/open). `emitLayout` calls
  `onLayout` only when the key changed (a pending flag survives rAF cancellation); the xterm is fitted every time.
  `setActivity`/focus/active tab never resize the canvas. Opening via the Tech Lead = `focusSession` once, then
  `panel.focusTerminal()` in rAF (plain focus, no `render()`), so the keyboard ends in the xterm after the canvas mousedown.
- E2E test 16 drives collapse/open through `__desktopActions` with a fake terminal bridge and checks `__office.resizes`.
- Vignette textures (spec 046): `ensureVignette` creates one `vignette:WxH` per size; `applyVignette` (rugs.ts) sets the new
  texture on the image first, then `removeStaleVignettes` removes every other `vignette:*` key, so only the one in use survives.

## Cenário esticado ao abrir o terminal (spec 116)

- **Causa confirmada por spike** (Playwright, 1920x1080 e 3440x1440, terminal fake de e2e 16, amostras por rAF):
  depois de abrir/recolher o terminal, `canvas.height` já estava certo (800 ou 1052), mas
  `canvas.style.height` ficava um passo atrás (`1052px` com canvas de 800 e vice-versa), e permanecia
  assim 1 s depois. O canvas aparece esticado até outro resize reescrever o estilo (mover o terminal).
- Origem no Phaser 3.90: `ScaleManager.resize` só escreve `canvas.style` quando
  `width * zoom !== width`, isto é, nunca com zoom do Phaser = 1 (zoom CSS = renderScale, o caso comum
  em dpr 1). `setZoom` também fazia `refresh()` e emitia um `RESIZE` extra com o tamanho antigo.
- Não confirmado como causa: quadro entre DOM e canvas (o estilo ficava errado de forma estável, não por
  um quadro) e limites da câmera por `displayWidth` (mantido por robustez, ver abaixo).
- Correção: `applyResize` atribui `game.scale.zoom` (sem `setZoom`), chama `scale.resize` (um único
  `RESIZE`) e escreve `canvas.style` a partir de `canvasCssSize(viewport)` (`scale.ts`, puro), também
  quando o viewport não mudou. O `ResizeObserver` duplicado de `#game` foi removido.
- `OfficeScene`: `onResize` dá o tamanho novo à câmera antes de recalcular zoom e limites;
  `setCameraBounds` usa `worldViewSize(logicalSizeOf, userZoom)` em vez de `camera.displayWidth`.

## Clique no personagem só funciona uma vez (spec 123)

- **Causa confirmada por spike** (Playwright, 1920x1080, terminal fake do e2e 16, `game.scale` exposto
  temporariamente): depois de recolher/abrir o terminal, `canvas.getBoundingClientRect()` já estava certo
  (1920x1052 / 1920x800), mas `scale.canvasBounds` e `displayScale` ficavam um passo atrás
  (`displayScale.y` = 1.315 e 0.760 em vez de 1). O Phaser mapeia o ponteiro com `canvasBounds` e
  `displayScale`, então o clique caía fora do personagem até outro resize.
- Origem: `applyResize` escrevia `canvas.style` (`applyCanvasStyle`) depois de o Phaser medir o canvas
  (`scale.resize`/`refresh`), e nada media de novo. No ramo "viewport igual" o `refresh` também rodava
  antes do estilo.
- Regra: o estilo do canvas deve ser escrito **antes** da remedição (`game.scale.refresh()`, que não
  limpa o canvas). A ordem está em `resizePipeline.ts` (`applyResizePipeline`, puro, testado em
  `resizePipeline.test.ts`): zoom, `resize`, estilo, `refresh`; sem mudança: estilo, `refresh`.
- Coberto por `e2e/tests/character-click.spec.ts` (teste 18: Tech Lead com cliques repetidos após
  recolher e redimensionar; falhava antes da correção).
- Não reproduzido: agente passivo em navegador comum (teste 19 passa também com a ordem antiga; sem
  terminal o contêiner não muda, então não há remedição atrasada). Em desktop, `decideClick` devolve
  `collapse` para personagens que não são Tech Lead, por desenho.
- Ambiente: o e2e só avança com `page.on('console', ...)` registrado (sem listener o `connected`
  não chegava), e o jogo fica muito lento em 1920x1080 com WebGL por software; rodar com
  `--output` próprio se outro processo usar `e2e/test-results`.
