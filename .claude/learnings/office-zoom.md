# Office zoom (specs 033/034)

- Zoom lives in `packages/web/src/zoom.ts` (pure: limits 0.5-3, step 0.25, default 1, `agents-office.zoom` in localStorage with try/catch). Tested in `test/zoom.test.ts`.
- It is applied with `camera.setZoom` on the main camera of `OfficeScene` (`userZoom` / `applyZoom`), so HUD, dialog and prompt (separate/fixed objects) keep their size. The browser-level integer zoom (`scale.ts`) is untouched.
- Ctrl + wheel: Phaser `wheel` input event (`pointer.event` is the DOM WheelEvent) in `setupInput`; `main.ts` also adds a non-passive `wheel` listener on `game.canvas` that cancels the native page zoom when `ctrlKey`. The terminal panel is outside the canvas, so it is unaffected.
- Other UI (spec 034 buttons) asks for a step by emitting `ZOOM_STEP_EVENT` (`'zoom-step'`) on `game.events` with payload `1 | -1`. The scene removes the listener on SHUTDOWN.
- The overview (`M`) ignores zoom steps; leaving it restores `userZoom` instead of 1. The overview never writes the stored zoom.
- `window.__office.zoom` exposes the user zoom for E2E.
- `screenArt.test.ts` can time out (5s) under load when the whole suite runs in parallel; it passes alone.
- Spec 034: `ui/zoomControls.ts` mounts `data-testid="zoom-in|zoom-out"` buttons (absolute, bottom-right of `#game`, style via `.ao-zoom-btn` in `buttonStyles.ts`). The scene publishes `ZOOM_CHANGED_EVENT` (`'zoom-changed'`, `{zoom, overview}`) on `game.events` from `applyZoom`/`toggleOverview`; the buttons listen to disable at the limits and hide in the overview. `window.__office.overview` was added for E2E.
- E2E: `keyboard.down('Control')` + `mouse.wheel` yields a `ctrlKey` wheel event in Chromium. Tests clear `agents-office.zoom` first because localStorage persists per context.
