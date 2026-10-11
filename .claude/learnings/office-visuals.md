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
- Volume language (spec 053, all 27 props): every piece is planes lit from the top-left -> a LIGHT
  top plane whose last row is the brightest (front edge), a front face shaded top to bottom, a
  1px lit left side and a dark right side, and a shadow under every overhang. Build it with the
  052 helpers: `legs`/`box` under, then `slab` (desks 7 rows + 3 thick, tables 3-5 + 2), then what
  sits on top. Objects on a surface cast their own shadow (`castOn`: a blended AO row over the
  surface, so the outline does not eat it). Furniture ramps use `{ contrast: 1.3 }` (leaves 1.2,
  plus olive/teal ramps for tone variety). Pots (`pot`) have an elliptical mouth with soil:
  draw the pot FIRST, then stems from the soil and leaves (low leaves hang over the rim).
  Counters: slatted front (`slats`) set 1 px back under an overhanging `slab` + a soft shadow row.
  Wall props get a frame with a lit top edge and `wallShadow` (after the outline: translucent AO
  1-2 px down-right on empty slot pixels, so it darkens whatever wall face it hangs on).
- Invariants kept by the redesign (check after regenerating): every `props.frames` `ax/ay/w` and
  `screens` identical (only `chair`/`chair-exec` grew 1 px in height for the casters), so
  `lighting.ts` `OFFSETS.props` did not change (monitor centre art y 11, lamp shade centre y ~6,
  espresso top at kitchen x 8, y 1-2). The doors use their own flat ramps (`DOOR_GRAPH`,
  `DOOR_METAL`): their frames stayed byte-identical (compare atlas crops before/after).
- Before/after screenshots in the app without touching `public/`: a Playwright script with
  `page.route('**/skins/default/props.png' | 'skin.json')` serving the old files, against
  `vite --port N` + `?demo`; `actions.approachCharacter(id)` / `approachDoor(id)` + held arrow keys
  move the camera to the lead desks, cubicles and utilities.

## Scene
- Walls are oriented: `wall`/`wall-corner-tl|tr` (face), `wall-side-l|r` (8px slab band on the outer
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

## Tall walls + automatic doors (3/4 with volume)
- Top (north) walls are `WALL_ROWS = 3` tiles high (48 px, 1.5x a character), from the top down:
  `wall-top` (slab = wall thickness, front face, shadow under it), `wall-mid`, `wall` (wainscot
  panels, skirting). `TOP_WALL_ROWS` in `roomLayout.ts`; every row collides. Art is one 48 px
  column (`faceColor(v, i)` in `tiles.mjs`, exported so the door art matches pixel for pixel).
- Side walls are 8 px slate bands (two rooms -> one 16 px wall). On the face rows of a top wall the
  band sits over the face: `Builder.faceUnderSide` paints the face tiles on the FLOOR layer under
  the band (the walls layer has only one tile per cell).
- `CORRIDOR_HEIGHT = WALL_ROWS + 3`; the entrance chunk is `WALL_ROWS - 1` rows taller and its
  content shifted (`in_()`); lobby content shifted the same (`ly()`). Wall decor (windows 2 rows,
  clock/poster/board, wall props) hangs on the middle row (eye level).
- A door is open through all wall rows; `door.tile` = bottom wall row, `outside` = corridor row
  above the wall. `doorAt` matches any row of the door column (the player faces the top row).
- Doors: `door-0..5` frames in the props atlas (24x48, 4 px jambs over the wall, no outline).
  `world/doors.ts` `DoorAnimator` steps the frame with the pure `stepDoor`/`doorShouldOpen`
  (column +-1, 2 rows beyond the opening, close delay 350 ms), fed with `controller.positions()` +
  the player. `window.__office.doors` exposes the state.
- Two layers (spec 050): `door-back` (dim doorway + 2-3 px reveal in the slab tones of
  `faceColor`) sits at `wallProps`, under everyone; `door-N` is the FRONT (wall above the lintel,
  lintel, jambs, threshold opaque, opening transparent, glass leaves alpha 0.55, sash/handle
  opaque) at `doorFrontDepth` = `4 + (floorLine + 0.75)/10000`, floorLine = `(door.tile.y+1)*16`.
  Characters use `4 + feetY/10000` and the player adds +0.5 px (0.00005), so +0.75 (not +0.5)
  keeps the player behind the frame while its feet are exactly on the wall's floor line. Whoever
  walks the wall rows passes inside the frame; in the room they are in front. A skin without
  `door-back` keeps the single layer at `wallProps` (`DoorAnimator.hasBack`).
- Door timing is set by the player's step (200 ms/tile): a player teleported to `outside` (Tab)
  or an NPC spawned there starts with the door closed and reaches the first wall row 200/250 ms
  later, so the door must open within ~190 ms with 16 ms frames: `DOOR_FRAME_MS = 36` (5 x 36 =
  12 game frames). The simulation in `doors.test.ts` passes up to ~44 ms and fails at 50; 36 keeps
  ~1.5 frames of margin. `NEAR_X = 1`/`NEAR_Y = 2` unchanged (walking the corridor past the door
  without turning in does not open it).
- E2E runs the PACKAGED cli when `packages/cli/dist` exists (`e2e/support/daemon.ts`), which
  serves its own copy of the web build: after `pnpm --filter @agents-office/web build` also run
  `pnpm --filter agents-office build`, or Playwright tests the stale web app.
- Props: PAD 3 in the atlas so each prop also bakes a soft cast shadow down-right (light from the
  top-left), clipped to its slot; tall boxes (shelf, rack, fridge) got a top plane.

## Wall slab with depth (spec 051)
- Why: the old top was a 5 px dark slate strip, same as the side bands, and read as a border/outline.
  A LIGHT top plane with a bright front edge and a darker front face reads as a thick volume.
- Anatomy of the 48 px top wall (`faceColor(v, i)` in `tiles.mjs`, v = row across the wall):
  v0 `SLAB_BACK` (dark back edge, separates the slab from the corridor floor), v1-4 `SLAB_TOP`
  (warm light grey, speckled `SLAB_SPECK`), v5 `SLAB_EDGE` (lit front edge), v6 `SLAB_FACE`,
  v7 `SLAB_FACE_LO` (front face of the slab), v8-11 `UNDER_SLAB` (slab shadow fading on the
  plaster), v12-28 plaster gradient (`PLASTER_TOP` -> `PLASTER_LOW`, ^1.3), rail v29-31, wainscot
  v32-41 with AO on v39-41 (`WAINSCOT_AO`, mixed towards `C.ao`), skirting v42-47 (`SKIRT_TONES`,
  darkening into the floor). `plasterShade` is a lookup (`SPECKLE`): only slab top, plaster and
  wainscot get the speckle.
- Side bands (`bandColor`): per column, outer edge `SLAB_BACK`, 1 px `SLAB_EDGE` on the left, top
  plane, 2 px face (`SLAB_FACE`, `SLAB_FACE_LO`) on the right (light from the top-left), for both
  `-l` and `-r`. Corners: on the slab rows (v0-5) the band becomes top plane (no front edge across
  it); on the right corner the slab's front edge turns down into the band's lit edge.
- `wall-bottom`: same slab rows v0-7 + an 8 px warm stone facade (shadow line, joint, base line);
  `wall-cap` is a whole tile of slab. The `door` fallback tile uses the slab tones too.
- `props.mjs` imports the `SLAB_*` constants for the `door-back` reveal (lintel underside
  `SLAB_FACE_LO`, left jamb `SLAB_FACE`, right jamb `SLAB_TOP` + `SLAB_EDGE`); the wall above the
  lintel is `faceColor` + `plasterShade` with the same noise, so it matches the tiles pixel for
  pixel (checked: 0 mismatches between `door-N` rows 0-8 and `wall-top`; the atlas frame starts at
  `y + ay - 48` because of the PAD).
- `lighting.ts` `WALL_SHADOW` has 6 rows `[0.32, 0.2, 0.12, 0.07, 0.035, 0.015]`.
- Fast offline check: compose tiles + door frames from `tileset.png`/`props.png` with PIL (side
  bands over `wall-mid`/`wall`/floor) and upscale; then confirm in the app.

## Volume helpers + ramp contrast (spec 052, for the furniture redesign)
- `ramp(base, { contrast })` (`tone.mjs`): lighten amounts x `contrast` (capped at 1), shade factors
  `** contrast`; `base`/`mid` unchanged. `contrast = 1` (default) is bit-identical to the old ramp
  (checked: regenerated `public/skins/default` byte-identical). Characters never call `ramp`.
  At 1.3 the oak `#d7b98d` goes hi `#e9d9c0`->`#eee2d0`, deep `#716454`->`#63574a`.
- Helpers exported from `props.mjs` (light from the top-left; each returns the first row below
  what it drew, so pieces stack):
  - `slab(c, x, y, w, depth, thick, R)`: top plane `depth` rows (back `R.light` -> halfway to
    `R.hi`, last row = front edge `R.hi`), `thick` rows `R.mid` -> `R.shade`, then a 1px
    `alpha(AO, 0.35)` shadow line BLENDED over what is under it. Draw legs/cabinet first.
  - `box(c, x, y, w, topDepth, frontH, R)`: top plane (`R.light`, front edge `R.hi`; 0 = no top),
    front face `R.base` -> `R.mid`, left column `R.hi`, right column `R.deep`, bottom row AO.
  - `legs(c, xs, y, h, R, { w = 2 })`: 2 px legs `R.mid`|`R.deep` (1 px: `R.shade`), plus a
    translucent AO dot on the floor down-right of each foot (diagonal, so the outline keeps it).
  - Translucent pixels on EMPTY space next to the art become outline (`outline()` only keeps alpha
    >= 200 as solid), so shadows that must survive go over drawn pixels or after the outline.
- Preview (not part of the build): `node packages/web/scripts/skin/preview-props.mjs [out.png]`
  (default `<tmpdir>/preview-props.png`): every atlas frame over `floor` and again over `wood`, a
  palette-swapped, outlined character next to each for scale, a `helpers` sample cell (table =
  legs + slab, cabinet = box, contrast 1.3), upscaled 3x. The result is too tall for the Read hook:
  crop it (PIL) before reading.
