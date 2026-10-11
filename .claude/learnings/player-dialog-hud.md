# Player avatar, dialog and HUD (spec 011)

- Keys: arrows/WASD move; Z / Enter / Space = A (A itself walks); X / Esc = B; Tab = room with latest activity (corridor tile in front of its door); Shift+Tab cycles waiting actors. Mouse click on a character opens its dialog; click advances an open dialog. Drag-to-pan was dropped: the camera follows the player (Phaser lerp 0.14) and is bounded by the building.
- Pure logic (Phaser-free, tested): `src/player/playerMotion.ts`, `src/ui/dialogContent.ts`, `src/ui/hudLogic.ts`. Phaser wrappers: `player.ts`, `dialogBox.ts`, `hud.ts`.
- Player look: `PLAYER_LOOK` in `characters/appearance.ts` (architect outfit + cap, red shirt, blue pants; colors outside the skin palettes so no NPC can look like it). Built by `CharacterFactory.getPlayer()`.
- Player blocks NPCs through `CharacterController.setExternalBlockers`; NPCs turn to the player with `faceToward` / `releaseFacing` (faceLock).
- The bitmap font gained glyphs for the down arrow and the middle dot (generate-default-skin.mjs); text is uppercase-only, `sanitize` swaps unsupported glyphs for `?`.
- HUD counts = `/health` definition: Object.keys(model.sessions/agents).length. E2E: replay a fixture with shifted timestamps into a temp projects dir, drive keys with Playwright, read `window.__office` (player, hud, dialog).

## HUD v2
- Top-left pill in mixed case (`hudText`: "2 sessões · 5 agentes · ! 1"); top-right shortcuts from
  `HUD_HINTS` rendered by `ui/keyHints.ts HintRow` (3D key caps, tiny font in caps, label font after).
- Bottom-centre `PromptBar` (`promptFor`): dialog keys, "[Z] Conversar com <nome>", the Hall of Fame,
  or "[H] Ver todos os controles" for 7 s, then rotating `TIPS`. Fades between contents.
- `H` / `?` toggles `HelpPanel` (controls from `HELP_CONTROLS`, status and role legends); while it is
  open any key or click closes it and movement is blocked. The player's own tag hides while facing
  someone (the prompt already names them).
- `?demo` is busier on purpose (4 tools per tick, 3-8 s each, leads use Agent) so the monitors show
  every activity.
