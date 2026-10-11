# Office zoom (specs 033/034)

- Zoom lives in `packages/web/src/zoom.ts` (pure: limits 0.5-3, step 0.25, default 1, `agents-office.zoom` in localStorage with try/catch). Tested in `test/zoom.test.ts`.
- It is applied with `camera.setZoom` on the main camera of `OfficeScene` (`userZoom` / `applyZoom`), so only the world scales (HUD/dialog/prompt are handled by the UI camera, see spec 037 below). The browser-level integer zoom (`scale.ts`) is untouched.
- Ctrl + wheel: Phaser `wheel` input event (`pointer.event` is the DOM WheelEvent) in `setupInput`; `main.ts` also adds a non-passive `wheel` listener on `game.canvas` that cancels the native page zoom when `ctrlKey`. The terminal panel is outside the canvas, so it is unaffected.
- Other UI (spec 034 buttons) asks for a step by emitting `ZOOM_STEP_EVENT` (`'zoom-step'`) on `game.events` with payload `1 | -1`. The scene removes the listener on SHUTDOWN.
- The overview (`M`) ignores zoom steps; leaving it restores `userZoom` instead of 1. The overview never writes the stored zoom.
- `window.__office.zoom` exposes the user zoom for E2E.
- `screenArt.test.ts` can time out (5s) under load when the whole suite runs in parallel; it passes alone.
- Spec 034: `ui/zoomControls.ts` mounts `data-testid="zoom-in|zoom-out"` buttons (absolute, bottom-right of `#game`, style via `.ao-zoom-btn` in `buttonStyles.ts`). The scene publishes `ZOOM_CHANGED_EVENT` (`'zoom-changed'`, `{zoom, overview}`) on `game.events` from `applyZoom`/`toggleOverview`; the buttons listen to disable at the limits and hide in the overview. `window.__office.overview` was added for E2E.
- E2E: `keyboard.down('Control')` + `mouse.wheel` yields a `ctrlKey` wheel event in Chromium. Tests clear `agents-office.zoom` first because localStorage persists per context.

## Static UI (spec 037)
- `setScrollFactor(0)` only stops scrolling; the object is still scaled by the camera zoom. Screen-fixed UI therefore goes through a second camera at zoom 1.
- `ui/uiOverlay.ts` (`UiOverlay`): `layer` (a Phaser Layer) + `camera` (zoom 1, name `ui`). The layer's own `cameraFilter` carries the main camera id (Phaser's `camera.ignore(layer)` only flags the children present at that moment). The UI camera ignores every top-level world object: it listens to `Phaser.Scenes.Events.ADDED_TO_SCENE` and judges the queue at `PRE_RENDER` (a UI part is created on the display list and moved into its container/layer right after, so only objects still on the scene display list get the filter). Listeners are removed in `destroy()` (scene shutdown); `resize` calls `camera.setSize`.
- New UI objects must be added with `ui.add(...)` (Hud, DialogBox, PromptBar, HelpPanel take the overlay in the constructor; vignette, skin warning and toast are added in OfficeScene). Depths are unchanged. Children of a layer container follow the container, so the UI camera filter must never be set on them.
- No UI object uses `setInteractive`; clicks are handled by `pointerdown` in the scene. With a second camera `pointer.worldX/worldY` follow the topmost camera (the UI one), so world picking uses `cameras.main.getWorldPoint(pointer.x, pointer.y)`.
- `window.__office.ui` has the HUD/hints/dialog rectangles in game pixels, the UI camera zoom and `mainCameraDrawsUi`; E2E test 10 also reads real screenshot pixels (`gamePixel` in `e2e/support/office.ts`) at zoom 0.5/1/3, since layout numbers alone cannot show a scaled render.
- World-space name tags/characters still scale with the zoom on purpose. Pure helper: `hintPanelX` in `ui/hudLogic.ts`.
