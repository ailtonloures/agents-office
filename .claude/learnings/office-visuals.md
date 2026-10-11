# Office visuals (web client)

## Viewport
- The game fills the window (no letterbox): `computeViewport()` in `scale.ts` picks an integer zoom
  (device px) that keeps >= 240 game px of height (and >= 256 of width), and the logical size that
  covers the window at that zoom (~427x240 at 720p/1440p, 480x270 at 1080p). `main.ts` calls
  `scale.setZoom` + `scale.resize`; scenes listen to `Phaser.Scale.Events.RESIZE`.
- Never use `GAME_WIDTH/HEIGHT` for layout (they are only the initial size): screen-fixed objects take
  `scene.scale.width/height` and expose a `layout()` (HUD, DialogBox), the vignette is regenerated.
- The `M` overview must `camera.removeBounds()`: with a view bigger than the bounds Phaser pins the
  scroll to the top-left corner. Bounds are restored when leaving the overview.

## Default skin (v4), generated: `pnpm --filter @agents-office/web generate-skin`
- Sources in `packages/web/scripts/skin/`: `tiles.mjs`, `props.mjs`, `tone.mjs`, `characters.mjs`,
  `font.mjs`. Edit the
  generator, never the PNGs. After generating: `npx biome format --write packages/web/public/skins/default/skin.json`.
- Characters are 16x32, 6 columns: per direction row stand/step/step/breathe/blink, then poses
  (sit-type a/b/c, read/read-b, phone, sleep/sleep-b, celebrate/celebrate-b). Maps are strings with a
  shared legend (`LEGEND`); key colors include `skinLight/shirtLight/pantsLight` (3 tones per material).
  Keep a 1px transparent margin: the selective outline is added at runtime (`outlineFrames(..., ink)`).
- Seated poses are drawn `SEAT_DY` rows lower so the head does not hide the monitor; balloons use
  `characters.head.{top,seatedTop}` via `CharacterFactory.headHeight(seated)`.
- Everything new in `skin.json` is optional (idle, extra poses, head, light key colors, `wood` tiles)
  so v1/v2 skins still load (checked by a test and by swapping the old skin in the app).
- Main font is proportional with real lowercase/descenders (line height 11); the tiny font is 3x5.
- Preview characters without the browser: compose the layer sheets + palette swap in a Node script
  (same logic as the factory) and upscale; much faster iteration than reloading the app.

## Props (skin v4): furniture bigger than a tile
- `props.mjs` draws the furniture into `props.png` (shelf-packed atlas) with the characters' language:
  one base color per material -> `ramp()` (hi/light/base/mid/shade/deep, `tone.mjs`), light from the
  top-left, baked selective outline (`outline()`, same formula as `palette.ts`) and a soft contact
  shadow painted after the outline on empty pixels only. Plants are procedural rotated-ellipse leaves.
- `skin.json` `props.frames[id] = {x,y,w,h,ax,ay}`: (ax, ay) is the frame pixel on the bottom-left
  corner of the footprint. Optional: without it the old furniture tiles are drawn.
- Gameplay side: `src/world/props.ts` `PROP_DEFS` (footprint width, fallback tiles, `wall`,
  `depthBias`). `Builder.prop()` records the placement AND writes the fallback tiles to the furniture
  layer, so collision, lighting (`computer`/`lamp`/`coffee` cells) and old skins keep working.
- Scene: one Image per prop, depth `4 + (bottom - 0.5 + bias)/10000` (characters use `4 + py/10000`),
  so a character behind a plant/desk is hidden by it. The chair has bias +2: it is drawn over the
  seated (back-facing) character, covering the lower back. Wall props (whiteboard, tv, art) sit at
  depth 2.5 on top walls. Covered furniture cells are not painted (`propCells`).
- `Lighting(scene, props)` shifts the monitor/lamp/steam anchors for the taller art and puts each glow
  just above its prop's depth (else the prop image hides it).
- Iterate on art fast: `makePropsAtlas()` in a throwaway Node script, composite on a grey background,
  upscale x3 and Read it, before opening the app.

## Scene
- Walls are oriented: `wall`/`wall-corner-tl|tr` (face), `wall-side-l|r` (6px slate band on the outer
  edge, rest transparent so the floor shows; occlusion baked in), `wall-bottom` (slab + facade).
  Two neighbouring rooms make one slim 12px wall. Fallback chain: side/bottom -> `wall-cap` -> `wall`
  (`tileFrame` follows `TILE_FALLBACK` recursively).
- Wood boards use the same tone per board row in both variants (only the butt joint moves); different
  tones per variant made the lobby look like brickwork.
- The camera may show `TOP_MARGIN` px above the building so the HUD does not hide the top wall.
- Soft ceiling light pools (ADD, depth 1.55) over the lobby and rooms.
- Carpet tiles are laid quarter-turned (`floor`/`floor-b` checkerboard); the lobby is `wood`.
- Rugs (`rugs.ts`) are calm carpet tinted ~14% by the room accent with a soft (45% alpha) accent line;
  the lobby rug is dusty blue with a cream line.
- `world/lighting.ts`: wall drop shadows (Graphics), window/lamp light (ADD blend images), monitor
  glow pulsing for busy seats (`controller.busySeats()`), coffee steam particles. No shaders, so
  Canvas fallback renders the same.
- When the tilemap grows it is recreated: tiles already on screen are carried over (`carried`) so
  only new tiles get the fade-in wave (before, the whole building re-faded).
- Name tags are compact pills under the feet; the detail line shows when the player is within 2
  tiles, on hover, for the highlighted character, or with `?tags=full`.
- The character in front of the player (or under the mouse) gets a white 1px outline made of four
  tint-filled copies of its sprite offset by 1px.

## Screenshots
- The Read hook rejects images with >350 "lines" (newline bytes): saving the crop as JPEG (lower
  quality until it fits) is the quickest way. Alternatively downscale by the zoom with NEAREST to native game
  pixels, then re-upscale x2 and quantize (PNG). Quantizing can shift colors: sample the original.
- Playwright MCP can only write under the repo (`.playwright-mcp/`, gitignored).

## Desk-bound workers + live monitors (skin v5 art pass)
- Rule: agents and Tech Leads never leave the workstation while working. `DEFAULT_TOOL_TABLE` has no
  `target`s (Bash/Web/Agent happen seated); the old behaviour lives in `ROAMING_TOOL_TABLE`. A
  finished agent celebrates at its desk (`delivering` goal is always `stay`), then walks out.
- Every at-desk activity is a seated animation: typing/terminal/summoning -> `sit-type`,
  reading/web -> `read`, sleeping -> `sleep`, thinking/waiting/error -> `sit` (still, rare keystroke).
- Monitors: props declare their glass in `skin.json` `props.frames[id].screens` (relative to the
  anchor, recorded by `monitor(..., 'off')` in props.mjs). `world/deskScreens.ts` maps seat -> prop
  (prop row = seat row - 1) and draws `world/screenArt.ts` (pure, clipped, 6 fps): code, terminal,
  page, browser, summon hub, Claude's orange spinner (thinking), amber "!" (waiting), red X,
  screensaver; dark when the seat is empty. Lead desk: middle screen = activity, sides = dashboard.
  Monitor glows (`Lighting.update`) are tinted with the screen's color.
- Seated characters show no think/sleep balloon (the screen says it); wait/error badges stay.
- Room floor is a honey-oak herringbone (4x8 boards, period 16 px so tiles join). Keep the seam close
  to the board tones: a light highlight row made it read as basket-weave and too busy.

## Name tags / fonts
- `font/label.*`: mixed-case 5 px-cap label face with an accent row on top (1 blank row between accent
  and lowercase, otherwise "á" reads as "d"). Circumflex is a centred dot ("#.#" reads as an umlaut).
- Tags: compact = role stripe + status dot + name (label font); expanded (near/hover/highlight) adds
  ROLE · STATUS (tiny font) and the action line (`ui/identity.ts actionLine`). Two-line compact tags
  were too wide for desks 64 px apart. Expanded cards get +0.5 depth over neighbours.
- Names: `agentDisplayNames` numbers same-type agents per session by start order ("Explorer 2").
- Seated tags sit 2 px above the feet (over the chair base) so they never cover the next desk row's
  monitors.
- Every new skin file must be listed in `public/skins/default/LICENSES.md` (cli package test) and the
  cli `dist` must be rebuilt (`pnpm build`) before its package test sees new skin files.
