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
