<p align="center">
  <img src="assets/logo.svg" alt="Agents Office logo" width="128" height="128" />
</p>

<h1 align="center">Agents Office</h1>

<p align="center">A pixel art office that mirrors your <a href="https://claude.com/claude-code">Claude Code</a> agents in real time.</p>

![Agents Office: rooms per project, agents at their desks and the terminal dock](assets/screenshot.png)

## The idea

Running several Claude Code sessions, each spawning subagents, quickly turns into a wall of
terminals. Agents Office turns that activity into a place you can look at:

- **Each project is a room**, built on the spot the first time the project shows activity, with
  its name on a plaque above the door.
- **Each session is a Tech Lead** at the main desk of its room.
- **Each subagent is an employee** with an IT profession (Analyst, Architect, Dev, QA, Support):
  it walks in, takes a desk, animates according to the tool it is using, delivers its report to
  the Tech Lead when done and leaves.
- **A colored ring** under every character shows whether it is working, thinking, waiting for
  you or in error. Walk up to anyone with your own avatar to see their task, current tool, recent
  steps and token usage.
- **The Hall of Fame** board in the lobby lists the last agents that finished.

It works passively by reading the Claude Code transcripts in `~/.claude/projects`; optional
Claude Code hooks make updates instant and show when an agent is waiting for you. Everything stays
on your machine: the daemon binds `127.0.0.1` only, with no telemetry.

## Run locally

Requires Node >= 20 and pnpm >= 9.

```bash
pnpm install
pnpm --filter @agents-office/daemon dev   # terminal 1: the daemon (port 4777)
pnpm --filter @agents-office/web dev      # terminal 2: Vite with hot reload, open the URL it prints
```

`pnpm dev` at the root starts all of them at once, the desktop app included.

Or run the built app the way users get it, on `http://127.0.0.1:4777`:

```bash
pnpm build
pnpm --filter @agents-office/daemon exec agents-office start
```

Desktop app (Electron window with the daemon embedded, tray and terminal dock):

```bash
pnpm --filter @agents-office/desktop dev
```

Optional, for instant updates and "waiting for you" alerts, install the Claude Code hooks (a backup
of `~/.claude/settings.json` is kept; `hooks uninstall` removes them):

```bash
pnpm --filter @agents-office/daemon exec agents-office hooks install
```

Checks:

```bash
pnpm lint && pnpm typecheck && pnpm test
```

## License

[MIT](LICENSE). Logo and default skin assets: CC0 1.0.
