# Packaging and E2E (spec 012)

- Published package = `packages/cli` (`agents-office`): `scripts/build.mjs` bundles `packages/daemon/src/cli/index.ts` to `dist/cli.mjs` and `hook.ts` to `dist/hook.mjs` with esbuild (shared + zod inlined; fastify, @fastify/websocket, chokidar, open stay dependencies), copies `packages/web/dist` to `dist/web`. The plain-Node bin (`bin/agents-office.mjs`) routes `hook` to `dist/hook.mjs` (~40 ms).
- Paths that differ between monorepo and package (bin, package.json, web dist) are resolved in `packages/daemon/src/cli/paths.ts` by trying both layouts.
- Verify the tarball: `pnpm pack` in `packages/cli`, `npm install <tgz>` into a temp project, run `npx agents-office start --no-open --port N` (npx on a bare .tgz path does not work).
- `packages/cli/test/package.test.ts` guards the skin LICENSES.md (every asset listed, all CC0) and the packed file list.
- Hall of Fame entries carry `projectName` (captured at `agent.finished`) because sessions and projects vanish when a session ends.
- E2E (`e2e/`, Playwright): spawns the real bin (packaged if built), random port, temp projects dir; `support/feeder.ts` replays daemon fixtures line by line re-stamped to now. The parallel-subagents fixture flips agents between working/thinking each step, so assert "was seen working", not "3 working at once". `window.__office.actions` (approachCharacter/approachBoard) teleport the player; `dialog.pages` exposes the dialog text.
