# Agents Office

A modern pixel art office that grows as your agents are born, and mirrors your
[Claude Code](https://claude.com/claude-code) agents in real time.

The office is a light, modern workplace (carpet, polished concrete, pale oak, daylight from the
windows and warm lamps) that fills the whole window at a crisp integer zoom. Each project with
Claude Code activity becomes its own room (with a name plaque above the door, its own accent color
and rugs), built on the spot as the project appears. Characters are detailed 16x32 sprites that
breathe, blink, type and celebrate. A colored ring under their feet shows when they are working,
thinking, waiting for you or in error. Every character carries a name tag with its role; walk close
or hover it to read its task (`?tags=full` always shows it). Press `M` for a map of the whole building. Each session becomes a **Tech Lead**
at the main desk. Each subagent becomes an employee with an IT profession (Analyst, Architect,
Dev, QA, Support) who walks in, takes a desk, animates according to the tool in use, delivers a
report to the Tech Lead when done and leaves. You walk around with your own avatar and talk to
anyone to see their task, current tool, recent steps and token usage. The board in the lobby is
the **Hall of Fame**: the last 20 agents that finished, with profession, task, project, duration
and time.

It works passively by reading Claude Code transcripts. Optional hooks make it instant and show
when an agent is waiting for you.

## Install and run

Requires Node >= 20.

```bash
npx agents-office            # or: npm install -g agents-office && agents-office
```

This starts a local daemon on `http://127.0.0.1:4777` and opens the office in your browser. It
watches `~/.claude/projects` (the Claude Code transcripts).

### Optional: instant updates with hooks

Transcripts alone are enough, but Claude Code hooks make events instant and let the office show
when an agent is **waiting for you** (the `! n` counter in the HUD).

```bash
npx agents-office hooks install              # edits ~/.claude/settings.json (a backup is kept)
npx agents-office hooks install --dry-run    # preview the diff without writing
npx agents-office hooks status               # which events are installed, is the daemon up
npx agents-office hooks uninstall            # removes only the entries added by agents-office
```

The installed hooks call `agents-office hook`, which posts the payload to the local daemon and
exits quickly; it never blocks Claude Code, even when the daemon is not running. Hook commands
use absolute paths to the installed copy, so run `hooks install` again after moving or
upgrading a global install.

`hooks install` also registers a `PermissionRequest` hook (with `timeout` 86400 s) so permission
requests can be approved from the office UI. That hook waits for the daemon's answer and prints
the decision for Claude Code. If the daemon is off, no UI is connected, the request is answered in
the terminal, or anything fails, it prints nothing and exits 0: Claude Code's normal terminal
prompt (always on screen in parallel) stays in charge. Running `hooks install` again on an older
installation adds only this new event.

### Flags

| Flag | Meaning |
| --- | --- |
| `--port <n>` | Port to listen on (default `4777`, env `AGENTS_OFFICE_PORT`) |
| `--projects-dir <path>` | Claude Code projects directory (default `~/.claude/projects`, env `AGENTS_OFFICE_PROJECTS_DIR`) |
| `--professions <path>` | `professions.json` overriding the default tool to profession table |
| `--skin <dir>` | Use an external skin (see below) |
| `--no-open` | Do not open the browser |
| `--unsafe-host <host>` | Bind a non-loopback host. There is no authentication: only use it on networks you trust |

`hooks` accepts `--settings <path>`, `--port <n>` and `--dry-run`.

### Controls

Arrows/WASD walk. `Z`/`Enter`/`Space` talk to whoever (or whatever, like the Hall of Fame board)
you are facing, and advance the dialog. `X`/`Esc` close it. `Tab` jumps to the room with the
latest activity, `Shift+Tab` cycles through agents that are waiting for you. Clicking a character
also opens its dialog.

## Skins and assets

The bundled default skin is original, procedurally generated pixel art released under **CC0 1.0**
(see `packages/web/public/skins/default/LICENSES.md`, which lists every asset; a test fails if a
file is added without being listed there). The published package contains no third-party assets.

You can use a commercial pack such as [LimeZu's Modern Interiors/Office](https://limezu.itch.io/)
locally **without redistributing it**: build a skin directory in the same format as the default
one (a `skin.json` that maps tiles, character layers and font to your image files; see
`packages/web/public/skins/default/skin.json` and `packages/web/scripts/generate-default-skin.mjs`)
and run (the frame size is up to you; idle frames, extra poses and decor tiles are optional and
fall back to the basic ones):

```bash
npx agents-office --skin ~/my-skins/limezu
```

The directory is served only by your local daemon under `/skin/*`. Never commit or publish packs
you only have a personal licence for. If the external skin is invalid, the office falls back to
the default one and shows a warning.

## Desktop app

The desktop app (Electron) wraps the same office in its own window, starts the daemon for you, lives
in the system tray and shows a system notification when Claude Code asks for a permission. It
runs on **Linux and macOS only** and has **no automatic update** in this version.

### Install

Build the installers (Node >= 20, pnpm >= 9; the first run downloads Electron and the packaging
tools):

```bash
pnpm install
pnpm --filter @agents-office/desktop dist     # builds everything, then packages
```

The output goes to `packages/desktop/release/`:

- Linux: `agents-office-<version>-linux-x86_64.AppImage` (`chmod +x` and run it) and
  `agents-office-<version>-linux-amd64.deb` (`sudo apt install ./agents-office-*.deb`). On hosts
  where Chromium's sandbox is unavailable, start it with `--no-sandbox`.
- macOS (run `dist` on a Mac): `agents-office-<version>-mac-<arch>.dmg`. Drag the app to
  Applications.

**macOS Gatekeeper warning.** The app is not signed or notarized, so macOS says it "cannot be
opened because the developer cannot be verified" (or that it is damaged). To open it anyway:
Control-click (right-click) the app in Applications, choose **Open**, then **Open** again; or go to
System Settings > Privacy & Security and click **Open Anyway**; or run
`xattr -dr com.apple.quarantine "/Applications/Agents Office.app"`.

### Hooks from the UI

Click **Hooks** (bottom left) in the app to see which Claude Code hook events are installed, preview
the exact change to `~/.claude/settings.json`, and install or remove them. A notice on first run
offers it. Nothing is written until you confirm, a backup (`settings.json.agents-office.bak`) is
kept, and removing the hooks restores the file. The installed command uses the app's own runtime,
so Node does not need to be installed.

### Approving permissions

With the hooks installed, a `PermissionRequest` from Claude Code appears as a card in the office
(press **Y** to approve, **N** to deny) and, when the window is hidden or unfocused, as a system
notification and a marker on the tray icon. Closing the window keeps the app and the daemon running
in the tray; **Sair** in the tray menu quits both. If the app, the daemon or the card goes
unanswered, Claude Code's terminal prompt stays in charge.

### Limitations

- Linux and macOS only (no Windows build).
- No code signing on macOS and no auto-update: install new versions by hand.
- The macOS `.dmg` is only produced by CI and was not verified by hand yet.

## Privacy

- The daemon binds `127.0.0.1` only and refuses to start on another host unless you pass
  `--unsafe-host` (it has no authentication).
- Everything stays on your machine: no telemetry, no analytics, no network calls other than to
  the local daemon. Transcripts are read, never modified or uploaded.
- The only file ever written outside the project is `~/.claude/settings.json`, and only by
  `hooks install` / `hooks uninstall` (with a backup).

## Caveat: transcript format

Claude Code's transcript files (`~/.claude/projects/**/*.jsonl`) are an internal format that is
not a public API and may change without notice. The reader is tolerant (unknown lines are
skipped), but a Claude Code update can degrade or break what the office shows until this project
is updated. Hooks are the documented interface and are the more stable source.

## Packages

| Package | Purpose |
| --- | --- |
| `agents-office` (`packages/cli`) | The published package: bundled daemon + built web app + default skin, plain-Node bin |
| `@agents-office/shared` | Canonical `OfficeEvent` / `OfficeModel` contracts with zod schemas |
| `@agents-office/daemon` | Node daemon sources: transcript watcher, hook receiver, WebSocket stream, CLI |
| `@agents-office/web` | Vite + Phaser 3 client that renders the office |
| `@agents-office/desktop` | Electron app: window, embedded daemon, tray, permission notifications, electron-builder packaging |
| `@agents-office/e2e` | Playwright end-to-end tests (`e2e/`) |

## Development

Requires Node >= 20 and pnpm >= 9.

```bash
pnpm install
pnpm dev          # daemon + Vite dev server (the web app proxies to the daemon)
pnpm typecheck
pnpm lint
pnpm test         # unit + integration tests (vitest)
pnpm build        # builds the web app and the publishable package in packages/cli
pnpm --filter @agents-office/e2e test   # Playwright (web); first time: pnpm --filter @agents-office/e2e exec playwright install chromium
```

Desktop e2e (Electron; needs a display, `xvfb-run -a` on headless hosts; uses the packaged build in
`packages/desktop/release/linux-unpacked` if present, else the dev build):
`pnpm --filter @agents-office/e2e exec playwright test desktop`. On Wayland hosts Electron may need
`--ozone-platform=x11`, which the test launcher already passes.

Run the daemon from the sources with `pnpm --filter @agents-office/daemon exec agents-office start`.

To check the package as users get it:

```bash
pnpm build
(cd packages/cli && pnpm pack)
cd "$(mktemp -d)" && npm init -y && npm install /path/to/agents-office-*.tgz && npx agents-office --no-open
```

## License

[MIT](LICENSE). Default skin assets: CC0 1.0.
