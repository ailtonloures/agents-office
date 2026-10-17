# Design

This document describes the visual design and the game layer of Agents Office: how the viewport
and zoom work, how the building is generated, how characters behave, how the art skin is produced
and the conventions of the UI. It is written for designers, artists and game or UI developers.

- For how the packages, the daemon and the web client fit together, see
  [ARCHITECTURE.md](./ARCHITECTURE.md).
- For building, running and testing the project, see [DEVELOPMENT.md](./DEVELOPMENT.md).

All paths below are relative to `packages/web/src` unless they start with `packages/`. The game is
a Phaser 3 scene (`scenes/OfficeScene.ts`) rendered with pixel-art settings (`pixelArt`,
`roundPixels`, `antialias: false` in `main.ts`). One tile is 16 x 16 game pixels and a character
is 16 x 32.

## 1. Viewport and zoom

There are two independent zoom layers. Keeping them apart is the key to not breaking the layout.

### 1.1 Window to canvas: integer zoom (`scale.ts`)

The game always fills the office area, with no letterbox. The zoom comes from the whole window
(`viewportForArea()`), never from the area left by the terminal panel, so opening the terminal does not
change the scale: the canvas is anchored top-left and the camera bounds are widened to the view, so a
view bigger than the building keeps it pinned to the left instead of centred. `computeViewport()` picks an **integer** zoom in
device pixels and the logical game size that covers the window at that zoom:

| Constant | Value | Meaning |
| --- | --- | --- |
| `TARGET_HEIGHT` | 240 | The view is never shorter than this many game pixels. |
| `MIN_WIDTH` | 256 | The view is never narrower than this; narrow windows lower the zoom. |
| `GAME_WIDTH` x `GAME_HEIGHT` | 480 x 270 | Only the size before the first measurement. Never use them for layout. |

Consequences for UI code:

- The canvas is rendered at **device resolution**: `width * renderScale` by `height * renderScale`
  (`renderScale` = device pixels per game pixel, published in the registry, `renderScale.ts`), so
  it maps 1:1 to the screen and zooming the camera out does not throw detail away. Phaser's own
  zoom is `zoom / renderScale`.
- Screen-fixed objects read `logicalSizeOf(scene)` (not `scene.scale.width`, which is now the canvas
  size) and expose a `layout()` that is re-run on the Phaser `RESIZE` event. The `ui` camera
  zooms by `renderScale` around the top-left corner.
- Setting the canvas size clears it. `viewportChanged()` skips a resize when zoom and size are
  unchanged, resizes are coalesced to one per animation frame, and the game is stepped once right
  after a resize so the cleared canvas is redrawn before the browser paints (no visible flash).
  Learning: `.claude/learnings/canvas-resize-flash.md`.

### 1.2 User zoom (`zoom.ts`)

On top of the integer zoom, the player can zoom the world with `camera.setZoom` on the main camera.

| Constant | Value |
| --- | --- |
| `ZOOM_MIN` / `ZOOM_MAX` | 0.25 / 3 |
| `ZOOM_STEP` | 0.25 |
| `ZOOM_DEFAULT` | 1 |
| `ZOOM_STORAGE_KEY` | `agents-office.zoom` (localStorage, always inside try/catch) |

The camera zoom is `userZoom * renderScale`. Steps and the stored zoom snap to a whole number of
canvas pixels per texel (`snapZoom`, `stepZoomCrisp`) so the pixel art keeps uniform pixels; only
below one pixel per texel (`textureFilterFor`) the world textures switch to a linear filter, which
averages minified texels instead of dropping them.

Ctrl + wheel zooms (a wheel up zooms in); the on-screen buttons from `ui/zoomControls.ts` ask the
scene for a step through game events on `game.events`:

| Event | Direction | Payload |
| --- | --- | --- |
| `ZOOM_STEP_EVENT` (`zoom-step`) | UI to scene | `1` (closer) or `-1` (farther) |
| `ZOOM_CHANGED_EVENT` (`zoom-changed`) | scene to UI | `{ zoom, overview }` |

The `M` overview shows the whole building; it ignores zoom steps, never writes the stored zoom, and
restores the user zoom when you leave it. The overview must remove the camera bounds (with a view
bigger than the bounds Phaser pins the scroll to the corner) and restores them afterwards. The
camera may show `TOP_MARGIN` (22 px) above the building so the HUD does not hide the top wall.

### 1.3 The UI overlay (`ui/uiOverlay.ts`)

`setScrollFactor(0)` only stops scrolling; an object is still scaled by the camera zoom. Screen-fixed
UI (HUD, dialog, prompt bar, help, vignette, toast) therefore lives in `UiOverlay.layer`, which the
zoomed main camera skips and a second camera (`ui`, zoom 1) draws. Rules:

- Add new screen-fixed objects with `ui.add(...)`.
- Do not use `setInteractive` on them; clicks are handled by the scene, which picks world objects
  with `cameras.main.getWorldPoint(pointer.x, pointer.y)`.
- World-space things (characters, name tags) scale with the zoom on purpose.

## 2. The procedural building

The building is never drawn by hand. `world/roomLayout.ts` (`layoutBuilding`) is a pure,
deterministic function from the list of projects to a `BuildingLayout` (three tile layers, props,
collision grid, desks, points of interest, doors, signs, rugs). The same input always gives the
same building, so rooms never jump around.

### 2.1 Floor plan

- The **lobby** is fixed at the left (x 0 to 15, `CHUNK` = 16 tiles wide), with the Hall of Fame
  board, the reception counter, sofas and the player spawn.
- A **corridor** band (`CORRIDOR_HEIGHT` = `WALL_ROWS` + 3 = 6 rows) runs to the right of the lobby.
- Below the corridor there is **one room per project**, each `CHUNK` tiles wide, placed left to right
  ordered by `firstSeen` (then id) and growing **downwards**. Adding a project or a desk never moves
  another room horizontally.
- The accent color of a room is `ACCENTS[hash(project id) % 8]` (`hashString` is FNV-1a): sky, coral,
  mint, lilac, gold, rose, teal, periwinkle. It tints the rug, plaque and sofas.

### 2.2 Chunks

A room is a stack of **chunks**, top to bottom. `roomChunks(sessionCount, agentCount)` returns
`entrance`, then `ceil(sessions / 2)` `lead-desk` chunks, then `ceil(agents / 3)` `cubicles-4`
chunks, then `utility`.

| Chunk | Height (tiles) | Content |
| --- | --- | --- |
| `entrance` | 9 (`7 + WALL_EXTRA`) | Automatic door through the top wall, project plaque to its left, wall art and windows, lounge nook (floor lamp, sofa, armchair, tables) on an accent rug, shelves, tall plants. |
| `lead-desk` | 8 | Up to `LEADS_PER_CHUNK` = 2 executive desks side by side, each with an exec chair, an accent rug, a bookshelf, a kanban board and a plant. One desk per Tech Lead session. |
| `cubicles-4` | 5 | Up to `CUBICLES_PER_CHUNK` = 3 workstations in one row (looks `workstation`, `workstation-b`, `workstation-c` picked by hash), a chair each, an accent rug and two corner plants. The name is historical: it holds three desks. |
| `utility` | 8 | Server racks, printer, kitchen island, fridge, water cooler, phone table and plants, on `tile` floor. |

The number of cubicle desks equals the number of agents: there is no spare capacity, and a room with
no agents has no `cubicles-4` chunk. A room gets one desk per agent (`cubicleChunksFor`).

### 2.3 Walls

North (top) walls are seen from the front and are `WALL_ROWS` = 3 tiles high (48 px, 1.5 times a
character). From top to bottom: `wall-top` (slab: cap, face, shadow), `wall-mid`, `wall` (wainscot
and skirting) - the constant `TOP_WALL_ROWS`. Every row collides, except the door column.

- Side walls (`wall-side-l`, `wall-side-r`) are 8 px slate bands; two neighbouring rooms make one
  16 px wall. On the face rows of a top wall the band is drawn over the face, which
  `Builder.faceUnderSide` paints on the **floor** layer (the walls layer holds one tile per cell).
- The bottom wall is `wall-bottom`; corners are `wall-corner-tl` and `wall-corner-tr`.
- Wall decor (windows are two rows: `window-top` + `window`, clock, poster, board, wall props)
  hangs on the middle row, at eye level.
- The entrance chunk and the lobby content are shifted down by `WALL_EXTRA` (= `WALL_ROWS` - 1)
  rows compared with a one-row wall; the layout code uses small helpers (`in_`, `ly`) for that.
- If a skin lacks a wall tile, `TILE_FALLBACK` (in `skin/schema.ts`) chains to a simpler one
  (for example `wall-side-l` to `wall-cap` to `wall`).

### 2.4 Project sign (plaque)

Each room has a `Sign`: the project name truncated to `SIGN_MAX_CHARS` = 14 characters
(`truncateSign`), centred on a tile in the entrance chunk. The plaque itself is drawn by the scene
(`world/roomDecor.ts`) at depth `DECOR_DEPTH.plaque` = 5 in the room's accent.

### 2.5 Points of interest and desks

`Poi` types are `server-rack`, `phone`, `window`, `hall-of-fame` and `whiteboard`. Each is a
walkable tile from which the object is used. Every room gets exactly **one** interactive
whiteboard prop on its own top wall, in the entrance chunk between the door and the window (the
`whiteboard` POI is the room floor tile just below it, inside `roomBounds`). The corridor has no
board. Desk ids are stable across regenerations: `<project>:lead:<session>` and
`<project>:cubicle:<n>`.

### 2.6 Doors, rugs and lights

- **Doors** are automatic sliding doors (`world/doors.ts`). The door tile is the bottom row of the
  wall and is open through all wall rows; `outside` is the corridor tile above the wall. A door has
  two layers: `door-back` (doorway, under everyone) and `door-N` (lintel, jambs and glass, the
  front, sorted with the characters by the wall's floor line). Whoever walks the wall rows passes
  inside the frame; in the room they are in front. A skin without `door-back` keeps one layer.
  Timing: `DOOR_FRAME_MS` = 36 per frame, `DOOR_CLOSE_DELAY_MS` = 350, opening when someone is
  within `NEAR_X` = 1 column and `NEAR_Y` = 2 rows. The timing is tied to the player's step
  (`PLAYER_STEP_MS` = 200); a slower animation would let the player walk into a closed door.
- **Rugs** (`world/rugs.ts`) are generated canvas textures: calm carpet tinted about 14 percent by the
  room accent with a soft accent line; the lobby rug is dusty blue with a cream line. They sit at
  depth 1.5 (`DECOR_DEPTH.rug`).
- **Lighting without shaders** (`world/lighting.ts`): wall drop shadows (a Graphics object, strengths
  in `WALL_SHADOW`), window and lamp light and soft ceiling pools as additive-blend images, monitor
  glows pulsing for busy seats, coffee steam particles. Because nothing uses shaders, the Canvas
  fallback renders identically. A vignette image is generated per canvas size (`ensureVignette`).
- **Floors**: carpet tiles are laid quarter-turned in a `floor`/`floor-b` checkerboard, the lobby is
  `wood`/`wood-b` boards, the corridor is `hall`, utility is `tile`.

### 2.7 Props

Furniture bigger than a tile is a **prop** (`world/props.ts`, `PROP_DEFS`): a footprint width `w`
on one row, `fallback` tiles written under it (so collision, lighting and skins without a props
atlas keep working), and optional `wall: true` (hangs on a top wall, no footprint) and `depthBias`
(the chair uses +2 so it draws over the seated character's lower back). Props come from the skin's
props atlas (`props.png`); each frame has an anchor on the bottom-left corner of the footprint.
`BLOCKING_FURNITURE` in `roomLayout.ts` lists the fallback tiles that block walking.

### 2.8 Live monitors

Props that declare `screens` rectangles in `skin.json` get animated monitor content from
`world/deskScreens.ts`, drawn by the pure `world/screenArt.ts` at `SCREEN_FPS` = 6. The screen
mirrors the seated character's activity (see section 3.3), is dark when the seat is empty, and the
glow cast on the desk takes the screen's color (`SCREEN_GLOW`). On a lead desk the middle monitor
shows the activity and the sides show a dashboard (`secondaryMode`).

## 3. Characters

### 3.1 Appearance (`characters/appearance.ts`)

A character's look is a pure function of its id and profession: `appearanceFor(id, profession)` hashes
each trait separately with FNV-1a, so the same agent always looks the same and traits do not
correlate. Index spaces (`APPEARANCE_RANGES`): hair style 7, skin 6, hair color 7, shirt 8, pants 4;
the factory wraps them onto the skin's real lists. Colors are applied by **palette swap** onto the
skin's key colors, with three tones per material.

Profiles (see the Cast panel) can set an explicit look (`explicitAppearance`) that replaces the
hashed skin, hair and shirt colors. The player avatar has a fixed look, `PLAYER_LOOK`: the architect
outfit and cap with a red shirt and blue pants that are not in the palettes, so no NPC can look like it.

Each profession has a fixed accessory (`ACCESSORY_BY_PROFESSION`) and an identity color (`ROLE_COLOR`
in `ui/nameTag.ts`):

| Profession | Accessory | Tag label | Color |
| --- | --- | --- | --- |
| `tech-lead` | tie | TECH LEAD | gold `0xf2c94c` |
| `analyst` | glasses | ANALISTA | blue `0x5fa8f0` |
| `architect` | cap | ARQUITETO | violet `0xb49cff` |
| `developer` | headphones | DEV | teal `0x58d6c4` |
| `qa` | badge | QA | green `0x6fdc7e` |
| `support` | headset | SUPORTE | orange `0xff9f6b` |

### 3.2 Design rule: workers stay at their desk

**Agents and Tech Leads never leave the workstation while they work.** The monitor and the seated
animation tell what is happening; characters do not walk to the server rack to run Bash or to a
window to browse. `DEFAULT_TOOL_TABLE` therefore has no `target`s. The older roaming behaviour is
kept as `ROAMING_TOOL_TABLE` (Bash at the server rack, web at the phone or window, Agent at the
door), and the state machine still supports targets. The only intentional exceptions are:

- drawing on the whiteboard (`board_add_elements`, `board_add_mermaid`, `board_clear` tools always
  walk to the `whiteboard` POI, whatever the table says), and
- delivering a message in person (visits, section 3.6).

A finished agent celebrates **at its desk** and then walks out of the door.

### 3.3 Activities

`characters/characterMachine.ts` is a pure state machine (no Phaser, no clock: `now` is passed in).
The activity says *what* a character does; it is derived from the actor status and current tool.

| Activity | Comes from | Seated animation | Monitor (`ScreenMode`) | Balloon when standing |
| --- | --- | --- | --- | --- |
| `thinking` | status `spawning`/`thinking`, or `working` with no tool | `sit` (still, rare keystroke) | `think`: Claude's orange spinner | `think` |
| `typing` | `Edit`, `MultiEdit`, `Write`, `NotebookEdit`; unknown tools (including `mcp__*`) | `sit-type` | `code` | none |
| `reading` | `Read`, `Grep`, `Glob` | `read` | `read` | none |
| `terminal` | `Bash` | `sit-type` | `terminal` | none |
| `web` | `WebFetch`, `WebSearch` | `read` | `web` | none |
| `summoning` | `Agent`, `Task` | `sit-type` | `summon` | none |
| `waiting` | status `waiting` | `sit` | `wait`: amber "!" | `wait` badge (bounces) |
| `error` | status `error` | `sit` | `error`: red X | `error` badge |
| `sleeping` | status `idle`, `finished`, `ended` | `sleep` | `sleep`: screensaver | `sleep` |

Seated characters show no think or sleep balloon (the monitor says it); the wait and error badges
always stay. The `balloons.ts` art is drawn procedurally from pixel maps (`BALLOON_IDS`: `think`,
`wait`, `error`, `sleep`, `doc`, 11 x 9 px) so it needs no skin assets. A status ring under the feet
is steady for working and thinking and pulses for waiting and error.

### 3.4 Phases

The phase says *where* a character is in its life. `nextVisualState` is the only place that changes it.

| Phase | Meaning | Goal |
| --- | --- | --- |
| `entering` | Spawned outside; walking in through the door. | desk |
| `walking-to-desk` | Heading to the assigned seat (also after a visit or a POI trip). | desk |
| `at-desk` | Seated and showing its activity. The normal working phase. | desk |
| `walking-to-poi` | Going to a point of interest (roaming tool table or the whiteboard). | poi |
| `at-poi` | At the POI performing the activity. | poi |
| `visiting` | At the recipient's desk delivering a message. | visit |
| `delivering` | A finished agent hands over its report at its desk (`DELIVER_MS` = 1400, `doc` balloon, confetti). | stay |
| `leaving` | Walking to the door to exit. | exit |
| `gone` | Left; the sprite is removed. | stay |

Typical lifecycle: `entering` to `walking-to-desk` to `at-desk`, then (agents) `delivering` to
`leaving` to `gone`. Timing constants:

| Constant | Value | Role |
| --- | --- | --- |
| `MIN_DWELL_MS` | 600 | An activity stays at least this long before another replaces it. `waiting` and `error` are shown at once, and a trip to a POI that ends on the way turns straight back. |
| `SUMMON_HOLD_MS` | 3000 | How long a Tech Lead keeps calling at the door (roaming tables only). |
| `DELIVER_MS` | 1400 | Celebration time before leaving. |
| `VISIT_TIMEOUT_MS` | 60000 | Safety net: a visitor goes back to its desk after this long, answered or not. |

### 3.5 Desk assignment (`characters/deskAssignment.ts`)

- A **Tech Lead** sits at the `lead-desk` bound to its session (`Desk.sessionId`).
- A **subagent** gets the free `cubicle` desk of its room that is nearest to an anchor desk (its
  parent's), keeps it until released and never shares it (`DeskAssignments.assign`). When the layout
  regenerates, `reconcile` drops assignments whose desk disappeared.
- `deskSpots` gives the walkable tiles around a desk: `talk` spots (right, left, in front and the two
  front diagonals) and a second ring of `wait` spots. `ConversationPoints` hands out distinct talk
  spots and keeps a first-come queue when they are all taken.

### 3.6 Visits (`characters/visits.ts`)

When a managed agent sends a message to another, the sender **delivers it in person**: it walks to the
recipient's desk (`visiting` phase), shows a speech bubble with a preview of at most
`VISIT_PREVIEW_MAX` = 60 characters, and stays until the message is answered or expires (or
`VISIT_TIMEOUT_MS` passes). Each sender has a FIFO queue and makes one visit at a time, so a
broadcast is several visits in a row. Replies never start a visit: the replier answers from its desk.

### 3.7 Highlights and name tags

| Effect | When | Look | Code |
| --- | --- | --- | --- |
| **Hover or facing outline** | The character the mouse is over, or the one the player faces. | White 1 px outline: four tint-filled copies of the sprite offset by 1 px, alpha 0.85. | `setHighlight` |
| **Tech Lead highlight** | The Tech Lead of the terminal tab that is open. | Gold (`ROLE_COLOR['tech-lead']`) 2 px outline, pulsing alpha `0.65 + 0.35 * abs(sin(t/400))`. | `setActiveLead` |

The scene learns the open tab from `TERMINAL_ACTIVE_EVENT` (`terminal-active`, payload: tab id or
`undefined`) and the registry key `REGISTRY_ACTIVE_TERMINAL`; a browser tab counts as no terminal
(`shownTerminalId`).

Name tags (`ui/nameTag.ts`) are compact pills under the feet: role stripe, status dot and name in the
mixed-case label font. The **expanded** tag adds ROLE and STATUS plus an action line
(`TAG_DETAIL_MAX` = 22 chars); it shows when the player is within 2 tiles, on hover, for the
highlighted character, or with `?tags=full`. Seated tags sit 2 px above the feet so they never cover the
monitors of the next desk row. Tags are hidden in the overview.

## 4. Depth (z-order)

Phaser depth orders everything; world objects share one formula so characters, props and doors sort by
their **feet line** (the y of the bottom edge, in world pixels).

| Object | Depth |
| --- | --- |
| Floor layer | 0 |
| Walls layer | 2 |
| Wall props (whiteboard, tv, art) | 2.5 |
| Furniture layer (fallback tiles) | 3 |
| Rugs / lobby text | 1.5 / 1.6 |
| Ceiling light / wall shadows / window light | 1.55 / 1.6 / 1.8 |
| Character shadow / status ring | `4 - 0.5 + y/10000` / `4 - 0.45 + y/10000` |
| Floor prop | `4 + (bottom - 0.5 + bias) / 10000` where `bottom` = `(row + 1) * 16` |
| Desk screen art | `4 + (bottom - 0.4) / 10000` |
| Monitor, lamp glows (props skin) | `4 + bottom / 10000 + 0.00002` |
| Character sprite | `4 + feetY / 10000` |
| Player sprite | `4 + feetY / 10000 + 0.00005` |
| Door front layer | `4 + (floorLine + 0.75) / 10000` |
| Highlight / Tech Lead outline | sprite depth `- 0.00002` / `- 0.00003` |
| Balloons | `6 + y / 10000` |
| Project plaque | 5 |
| Name tags | `7 + y/10000` (+0.5 when expanded; text +0.1) |
| Vignette / UI base | 900 / 1000 |
| HUD / prompt bar / dialog | 1500 / 1600 / 2000 |

Why the odd fractions: the player adds half a pixel over NPCs so it wins ties; the door front adds 0.75
pixel so the player stays *behind* the frame while its feet are exactly on the wall's floor line; the
chair bias of 2 draws it over the back of whoever sits on it.

## 5. The skin

The look of the office is a **skin**: a folder with `skin.json`, PNG atlases and fonts. The default skin
is original art generated by script, licensed CC0. **Edit the generator, never the PNGs**: they are
overwritten every time the skin is regenerated.

### 5.1 Generating

```bash
pnpm --filter @agents-office/web generate-skin
npx biome format --write packages/web/public/skins/default/skin.json
```

The entry point is `packages/web/scripts/generate-default-skin.mjs`; the drawing code lives in
`packages/web/scripts/skin/`:

| File | Draws |
| --- | --- |
| `tiles.mjs` | The tileset (floors, the 48 px wall column, side bands, windows...). |
| `props.mjs` | The props atlas, the doors, and the volume helpers (`slab`, `box`, `legs`). |
| `characters.mjs` | Body, hair, outfit and accessory layers and all poses. |
| `tone.mjs` | The `ramp()` color ramps (hi, light, base, mid, shade, deep). |
| `font.mjs` | The three bitmap fonts. |
| `canvas.mjs` | Small pixel-canvas helpers shared by the above. |
| `preview-props.mjs` | Not part of the build: renders every prop and a character for a quick look. |

The output is in `packages/web/public/skins/default/`: `tileset.png`, `props.png`, `characters/*.png`,
`font/*`, `skin.json` and `LICENSES.md`. A custom skin is used with `agents-office start --skin <dir>`.

### 5.2 Light and volume

Light always comes from the **top-left**. Every object is built from planes: a light top plane whose
last row is the brightest (the front edge), a front face shaded top to bottom, a 1 px lit left side and
a dark right side, and a soft shadow under every overhang. Props bake a soft cast shadow down and to the
right. Each material has one base color expanded by `ramp()`; furniture uses a higher `contrast`.
Characters carry a selective outline added at runtime, so their frames keep a 1 px transparent margin.

### 5.3 Schema (`skin/schema.ts`)

`skin.json` is validated with zod (`parseSkin`, never throws). All image paths must be relative and stay
inside the skin folder.

| Part | Required | Optional |
| --- | --- | --- |
| `name`, `version`, `tileSize` (must be 16) | all | `version` defaults to 1 |
| Tiles | `CORE_TILE_IDS`: `floor`, `wall`, `door`, `desk`, `chair`, `computer`, `server-rack`, `phone`, `window`, `plant`, `sign`, `board` | `EXTRA_TILE_IDS` (decor: `floor-b`, `hall`, `tile`, `wood`, `wood-b`, `wall-cap`, `wall-top`, `wall-mid`, side and corner walls, `window-top`, furniture such as `bookshelf`, `sofa-l`, `coffee`...). Each falls back through `TILE_FALLBACK`. |
| Characters | frame size, `walk` (4 directions x 3 frames), base `poses` `sit-type`, `read`, `phone`, `sleep`, `body`, at least one `hair` layer, `outfit` for every profession | `idle` frames, extra poses (`sit-type-b`, `sit-type-c`, `read-b`, `sleep-b`, `celebrate`, `celebrate-b`), `head` offsets, `baseColors`, `palettes`, per-profession `accessory` |
| Props atlas | none | `props.image` and `props.frames[id] = { x, y, w, h, ax, ay, screens? }` |
| Fonts | `font` (main) | `fontSmall` (3 x 5 tiny font), `fontLabel` (mixed-case tag font) |

Everything added after version 1 is optional so older skins still load. Characters are 16 x 32 with
6 columns per sheet; seated poses are drawn `SEAT_DY` rows lower so the head does not hide the monitor.
Balloons read `characters.head` to sit just above the head.

### 5.4 License rule

Every file in the skin folder must be listed in `packages/web/public/skins/default/LICENSES.md` with its
source and license. A test in the `cli` package enforces it, and the `cli` `dist` must be rebuilt
(`pnpm build`) before that test sees new skin files. Third-party art must never be committed; packs
bought for local use stay out of the repository.

## 6. UI conventions

### 6.1 Two kinds of UI

| Kind | Built with | Examples | Lives in |
| --- | --- | --- | --- |
| In-game | Phaser objects in the `UiOverlay` | HUD, key hints, prompt bar, dialog box, help panel, name tags, toasts | `ui/hud.ts`, `ui/promptBar.ts`, `ui/dialogBox.ts`, `ui/helpPanel.ts`, `ui/nameTag.ts` |
| DOM | HTML/CSS over the canvas | Terminal panel, Cast panel, project picker, Hooks settings, whiteboard overlay, zoom buttons, update banner | `ui/terminalPanel.ts`, `ui/castPanel.ts`, `ui/projectPickerPanel.ts`, `ui/settingsPanel.ts`, `ui/boardOverlay.ts`, `ui/zoomControls.ts`, `ui/updateBanner.ts` |

Most modules come as a pair: a pure `*Logic.ts` (tested without a browser) and a view that renders it.

### 6.2 Panels and text

- In-game panels are drawn with `ui/panel.ts`: rounded pixel corners, a 1 px border, a bevel line and a
  soft shadow. `DARK_PANEL` (dark glass) is used by the HUD, tags and toasts; `PAPER_PANEL` (light
  paper) by the dialog. Key caps (`drawKeyCap`) are small raised buttons.
- Three bitmap fonts: the main font (line height 11), the tiny 3 x 5 font and the
  mixed-case label font. The main font has a limited glyph set, so dialog text goes through `sanitize`
  (`ui/dialogContent.ts`), which swaps unsupported glyphs for `?`.
- DOM panels use the dark navy and gold palette: background `#2a2d44`, text `#f0e6b8`, border `#f0c040`.

### 6.3 Buttons (`ui/buttonStyles.ts`)

All DOM buttons share one look from `BUTTON_CSS`: 12 px monospace, dark fill, 2 px gold border, a 3 px
bottom shadow that collapses on `:active` ("press down"), a lighter fill on hover, a visible
`:focus-visible` outline and 45 percent opacity when disabled. To style a new button, **add its selector
to the `BUTTONS` list** rather than writing new button CSS.

### 6.4 HUD and controls

- HUD (`ui/hud.ts`, `HUD_HEIGHT` = 15): a top-left pill with counts (sessions, agents, waiting) and,
  top-right, key hints rendered as 3D key caps (`HUD_HINTS`: `TAB`, `SHIFT+TAB`, `M`, `H`).
- Prompt bar (bottom centre): dialog keys, "talk to <name>", the Hall of Fame, or the help hint, then
  rotating tips every `TIP_MS` = 7000.
- `H` or `?` opens the help panel (`HELP_CONTROLS`); while it is open any key or click closes it and
  movement is blocked.
- Controls: arrows or WASD walk (one tile per `PLAYER_STEP_MS` = 200 ms); Z, Enter or Space talk or
  advance; X or Esc close; Tab jumps to the room with the latest activity; Shift+Tab cycles agents that
  are waiting; M toggles the overview; Ctrl + wheel zooms. Mouse click opens details.
- What a click does is decided by the pure `ui/clickDecision.ts` (`decideClick`): in the desktop app a
  click on a Tech Lead with a live terminal tab opens the terminal; any other character opens its dialog;
  a whiteboard opens the board overlay; a click on empty space collapses the terminal panel. In a plain
  browser there is no terminal or board, so the dialog is the fallback.

### 6.5 Terminal dock

The terminal panel (`ui/terminalPanel.ts`, model in `ui/terminalTabs.ts`) can be docked `bottom`, `left`
or `right`. It occupies height (bottom dock, default `DEFAULT_PANEL_HEIGHT` 280, min 120) or width (side
docks, default `DEFAULT_PANEL_WIDTH` 480, min 240) and the office always keeps at least
`MIN_OFFICE_HEIGHT` = 160 px or `MIN_OFFICE_WIDTH` = 256 px. The tab strip (`TAB_BAR_HEIGHT` = 30)
stays visible when collapsed. The canvas is resized only when `layoutKey(model)` (dock, axis, size,
collapsed) changes, never for tab or activity changes, to avoid the resize flash of section 1.1.

### 6.6 Cast panel and whiteboard

- **Cast panel** (`ui/castPanel.ts`, logic in `ui/castLogic.ts`): the "Cast" button (shown as "Elenco" in `pt-BR`) opens a modal for
  a project's agent profiles: list, create or edit (name, instructions, base profession, hair style,
  skin, hair and outfit colors with a live preview of the character), delete, and the managed-session
  and message audit. Appearance choices use `APPEARANCE_RANGES` and `explicitAppearance`.
- **Whiteboard**: one per workspace on the room's top wall (`world/boardProp.ts`: `BOARD_PROP_ID`,
  `BOARD_OPEN_EVENT` = `board-open`). Click opens the full-screen overlay (`ui/boardOverlay.ts`),
  where Excalidraw is loaded lazily (`ui/boardIsland.ts`) so neither the main bundle nor the splash
  pay for it. Only the desktop app opens it, so only the desktop app shows its signals.
- **Whiteboard affordance** (spec 093, pure logic in `world/boardAffordanceLogic.ts`, drawn by
  `OfficeScene.updateBoardAffordance`): a small floating pencil badge above the board (gentle
  whole-pixel bob) and a faint pulsing glow over it (alpha `GLOW_MIN_ALPHA` to `GLOW_MAX_ALPHA`,
  the same `|sin|` pulse family as the active Tech Lead outline). They are world objects (Graphics,
  above `DEPTH.wallProps`, outside `UiOverlay`) placed from the prop image bounds, so they follow
  the zoom. Hover swaps the glow for a solid outline, tints the board, shows the hand cursor and the
  label `boardLabel()` ("Board — click to draw"). The badge counts as part of the board for
  clicks (`BADGE_REACH_PX`). Everything is hidden in a plain browser and while the board overlay,
  help, a dialog or the overview is open. Standing on the whiteboard POI shows the prompt
  "Open the board" (`PromptContext` `whiteboard`, distinct from `board` = Hall of Fame) and Z opens it.

### 6.7 Language button and message keys

- The language button (`ui/localeButton.ts`, pure logic in `ui/localeMenuLogic.ts`, test ids
  `locale-open`, `locale-menu`, `locale-option-<code>`) is the last item of the corner bar, after Hooks,
  Sessions and Cast. It shows `EN`, `PT` or `ES` and opens a small menu that lists each language by its own
  name. Choosing one stores it in `localStorage` (`agents-office.locale`) and reloads the page: there is no
  live re-render. It works in the desktop app and in a plain browser.
- UI text goes through `t(key, params?)` from `i18n/i18n.ts`. `i18n/messages/en.ts` is the source of truth
  for the keys; `pt-BR.ts` and `es.ts` are typed `Messages`, so a missing or extra key breaks the typecheck.
- Keys are flat, in dot notation, grouped by area (`hud.*`, `help.*`, `hooks.*`, `picker.*`, `cast.*`,
  `dialog.*`, `terminal.*`, `browser.*`, `board.*`...). Interpolation uses `{name}`. Resolve text at call
  time, never in a module-level constant (the locale is read once at startup, before panels mount).
- Not translated: profile names, project names, session content and anything written by Claude Code.
- Dates use `formatDateTime`, never a fixed locale. The in-game bitmap font has a limited glyph set, so
  the `dialog.*` strings in `pt-BR` and `es` are written without accents.

### 6.8 Stacking of DOM panels

Bottom-left corner controls (Hooks, Projects, Cast, language) use `z-index: 20`; full-screen modals and overlays
use 30; toasts and the lost-sessions banner 55 to 60. New DOM UI should follow these tiers.

## 7. Planned: embedded browser

An embedded browser tab, so agents can open and inspect web pages inside the app (browser host tab and
dock, CDP tools and queue, snapshot, screenshot and console tools, confirmations, element picker and
context, and an avatar state with docs), is **planned** in specs 080 to 085 and is not part of the
shipped design yet. Treat anything about it as provisional until those specs land; this section will
describe its panel conventions and the matching character behaviour then.
