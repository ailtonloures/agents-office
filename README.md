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

`hooks install` also registers a `PermissionRequest` hook so the office can warn you that Claude Code
is waiting for a permission. Like every other event it is fire-and-forget: it never prints a
decision and never delays the prompt, which appears in the terminal immediately. The office does
not approve or deny anything; answer in the terminal. Running `hooks install` again on an older
installation adds this event and drops the old long `timeout` from it.

## Desktop app

The desktop app (Electron) wraps the same office in its own window, starts the daemon for you, lives
in the system tray and shows a system notification when Claude Code asks for a permission (answered in the terminal). It
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

### Permission requests

With the hooks installed, a `PermissionRequest` from Claude Code only **notifies**: the agent shows a
`!` bubble, the HUD and tray icon count the pending requests and, when the window is hidden or
unfocused, a system notification says which tool is asking and to answer in the terminal. There are
no approve/deny buttons or keys in the app. When you approve or deny in the terminal (or the session
ends, or you send another prompt) the notification, bubble and counter go away on their own. If the
system cannot close notifications programmatically, the notification carries a native **Fechar**
button instead. Closing the window keeps the app and the daemon running in the tray; **Sair** in the
tray menu quits both.

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
