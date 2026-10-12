# CLAUDE.md

Rules for working in this repository. Each rule has its reason after the dash. For detail, read the
documents below instead of guessing.

## Project map

pnpm monorepo (Node >= 20, pnpm 9). Agents Office mirrors Claude Code activity as a pixel art office.

| Path | Role |
| --- | --- |
| `packages/shared` | Zod contracts, `reduce`, protocol, `desktop*` bridge contracts |
| `packages/daemon` | Fastify server, transcript watcher, normalizer, `agents-office` CLI and hook |
| `packages/web` | Phaser game plus DOM UI (runs in a browser or the desktop window) |
| `packages/desktop` | Electron shell: main, preload bridges, `node-pty` terminals, agent bus, updater |
| `packages/cli` | Publishable npm package that bundles daemon and web |
| `packages/landing` | Static commercial landing page (Vite + React, deployed on Vercel); standalone, not part of the app |
| `e2e` | Playwright tests |
| `.claude/` | PRDs, specs, learnings |

- [README.md](./README.md): what the product is.
- [DEVELOPMENT.md](./DEVELOPMENT.md): setup, scripts, checks, release.
- [DESIGN.md](./DESIGN.md): viewport, building, characters, skin, UI conventions.
- [ARCHITECTURE.md](./ARCHITECTURE.md): packages, processes, contracts, flows, security.

## Architecture

- Keep pure logic in its own module (`xxxLogic.ts`, e.g. `hudLogic.ts`, `castLogic.ts`), separate from
  Phaser and the DOM, and inject `now` instead of reading the clock — so it is unit-testable without a
  browser or fake timers.
- In `packages/desktop`, depend on interfaces (`...Like`, `...Deps`, e.g. `WindowLike`,
  `TerminalIpcDeps`), not on Electron, `fs` or `node-pty` directly. Only `main.ts` and
  `preload/index.ts` import `electron` — so modules stay testable and the shell stays thin.
- Every desktop capability is a trio: `<x>Channels.ts` (channel names), `<x>Ipc.ts` (main handler),
  `preload/<x>Bridge.ts` (renderer side), registered in `preload/index.ts`. The preload exposes
  only `window.agentsOfficeDesktop`, never `ipcRenderer` — the renderer must not get raw IPC.
- Web code must feature-detect `window.agentsOfficeDesktop` — the same bundle also runs in a plain
  browser against the standalone daemon.
- Put every cross-package contract in `packages/shared` as zod schemas. Use `z.looseObject` for
  data that Claude Code or files on disk can extend, and `safeParse` at every boundary (HTTP, WebSocket,
  IPC, files) — unknown fields must not break parsing, and bad input must not throw.
- `shared` has no build step (`exports` and `types` point at `src/`); consumers bundle it. Keep its
  only runtime dependency `zod`.
- The web client and the daemon apply the same `reduce` from `shared` — duplicating it would make
  their models drift. Keep it pure and replay-safe.
- `packages/daemon/src/cli/hook.ts` must have no relative imports — it runs on every Claude Code event
  and must start fast. The one allowed cross-package relative import is the desktop's use of
  `daemon/src/cli/settings-merger.ts`, so hooks are installed by identical code.
- A new event goes in `events.ts`, its normalizer, and a `case` in `reducer.ts`.

## Security

- Bind servers to `127.0.0.1` (`LOOPBACK_HOST`) — the daemon has no authentication.
- Write state files atomically (temp file plus rename, `writeJsonAtomic`). Move a corrupt file aside
  as a backup and start empty (`backupCorrupt`) — a crash or bad file must never lose data silently or
  crash the app.
- Approvals fail closed: timeout, shutdown, missing data or ambiguity means deny
  (`browserApprovals.ts`, `agentBus/spawnApproval.ts`) — an agent must never act without an explicit yes.
- Strip control characters from any text injected into a terminal (`sanitizeText` in
  `agentBus/messaging.ts`) — ESC could close the bracketed paste early and run input.
- Run external programs with `spawn(file, argsArray)`, never through a shell — the folder or text
  cannot then be read as a flag or command.

## Game and UI

- Never use `GAME_WIDTH`/`GAME_HEIGHT` for layout; they are only the initial size. Use
  `scene.scale.width/height` and a `layout()` method — the viewport follows the window with an
  integer zoom (`scale.ts`).
- In-game UI objects are added with `UiOverlay.add` — the overlay camera keeps them out of the
  zoomed world camera. DOM panels are separate (see DESIGN.md section 6).
- Corner controls (zoom, Hooks, Sessions) are children of `#game` with `position: absolute`, never
  `position: fixed` — `#ao-terminal` is a flex sibling of `#game`, and fixed ignores it and covers the
  terminal.
- Shared button look comes from `ui/buttonStyles.ts`.
- The skin is generated. Edit the generator (`pnpm --filter @agents-office/web generate-skin`), never
  the PNGs, and list every new skin file in `packages/web/public/skins/default/LICENSES.md` — a cli
  package test fails otherwise, and all assets must be CC0.
- Agents and Tech Leads never leave their workstation while working — the monitor and seated pose
  carry the activity (DESIGN.md section 3.2).
- Keep the keyboard owner explicit: when a terminal or panel is focused, Phaser's keyboard is
  released, otherwise Phaser `preventDefault`s typed keys.

## Style

- Biome decides formatting (`pnpm format`): 2 spaces, single quotes, semicolons, trailing commas,
  100 columns, organized imports. Lint must be clean.
- TypeScript is strict (`noUncheckedIndexedAccess`, `noImplicitOverride`, `verbatimModuleSyntax`):
  use `import type` for types, and relative imports without extension.
- Pin exact dependency versions (no `^`/`~`) — builds and Electron/node-pty ABI stay reproducible.
- Source is ESM. The Electron bundles (`dist/main.cjs`, `dist/preload.cjs`) are CommonJS because
  Electron loads `main` with `require`; `electron` stays external.

## Tests

- Unit tests are vitest files in each package's `test/` folder, next to the pure modules above.
- E2E is Playwright in `e2e/`. Build `web` and `cli` first (`pnpm build`); the packaged desktop e2e
  needs `xvfb-run` on Linux CI.
- Before handing work over, run `pnpm typecheck && pnpm lint && pnpm vitest run` and fix every failure
  you caused.
- Never rely on assumed Claude Code behavior: run a spike first and record it in a learning (the
  permission hook premise was refuted this way; see `permission-hook-and-pty.md`).

## Workflow in `.claude/`

- PRDs live in `.claude/prds/`, specs in `.claude/specs/` (numbered, with an `INDEX.md`), learnings only
  in `.claude/learnings/<topic>.md`. These are written in pt-BR. Update an existing learning before
  creating a new one. Never put learnings in `CLAUDE.md` or `~/.claude`.
- Commits: gitmoji as text (`:sparkles:`, `:bug:`, `:art:`), then an English message, with the spec
  number when there is one, e.g. `:sparkles: ... (spec 054)`.

## Language

- Code, comments, identifiers, commit messages and the root docs are in English.
- UI strings go through `t()` (`packages/web/src/i18n`); the default is English, and every key must exist in
  `en`, `pt-BR` and `es` (the typecheck and a parity test enforce it). Never hardcode UI text.
