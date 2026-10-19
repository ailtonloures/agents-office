# Packaging and E2E (spec 012)

- Published package = `packages/cli` (`agents-office`): `scripts/build.mjs` bundles `packages/daemon/src/cli/index.ts` to `dist/cli.mjs` and `hook.ts` to `dist/hook.mjs` with esbuild (shared + zod inlined; fastify, @fastify/websocket, chokidar, open stay dependencies), copies `packages/web/dist` to `dist/web`. The plain-Node bin (`bin/agents-office.mjs`) routes `hook` to `dist/hook.mjs` (~40 ms).
- Paths that differ between monorepo and package (bin, package.json, web dist) are resolved in `packages/daemon/src/cli/paths.ts` by trying both layouts.
- Verify the tarball: `pnpm pack` in `packages/cli`, `npm install <tgz>` into a temp project, run `npx agents-office start --no-open --port N` (npx on a bare .tgz path does not work).
- `packages/cli/test/package.test.ts` guards the skin LICENSES.md (every asset listed, all CC0) and the packed file list.
- Hall of Fame entries carry `projectName` (captured at `agent.finished`) because sessions and projects vanish when a session ends.
- E2E (`e2e/`, Playwright): spawns the real bin (packaged if built), random port, temp projects dir; `support/feeder.ts` replays daemon fixtures line by line re-stamped to now. The parallel-subagents fixture flips agents between working/thinking each step, so assert "was seen working", not "3 working at once". `window.__office.actions` (approachCharacter/approachBoard) teleport the player; `dialog.pages` exposes the dialog text.

## `firstWindow` expira no Electron 44 (janela sem navegação inicial)

- **Sintoma**: quase todo o e2e desktop falhava com `electronApplication.firstWindow: Timeout ... waiting for event "window"`, no CI e local (dev e empacotado), mesmo com `BrowserWindow.getAllWindows()` já na URL do daemon.
- **Causa confirmada por spike** (app Electron mínimo + `DEBUG=pw:protocol`): a janela nasce com URL `""` e só carrega `http://127.0.0.1:<porta>/` depois que o daemon sobe. No Electron 44 essa navegação não emite `Page.frameNavigated` por CDP (só `frameStartedNavigating` e eventos de ciclo de vida) e o Playwright só reporta a página depois do primeiro `frameNavigated` não inicial. Um `reload()` não ajuda. Com `about:blank` carregado antes, funciona.
- **Correção**: `createWindow` (`main.ts`) faz `win.loadURL('about:blank')` logo após criar a janela.
- **Testes desatualizados que o problema escondia** (atualizados, não enfraquecidos):
  - O título da aba não carrega mais o estado (`demo-app`, não `demo-app · encerrada`); o estado está em `tab.state`.
  - Os argumentos do `claude` agora começam com `--mcp-config <json>` (Agent Bus); o terminal quebra linha no meio, então as asserções usam regex com `\s+` entre as flags.
  - O canvas usa `ceil` (sem letterbox) e pode passar do painel em menos de um passo de zoom; o container (`overflow:hidden`) é que deve ficar acima do painel.
  - Clicar no escritório vazio no desktop recolhe o painel (spec 041, ponteiro corrigido na spec 123) e o estado recolhido persiste no reload.
  - `setConfig` rejeita `claudePath` que não é executável, então "claude ausente" depende do PATH: o teste do elenco fixa `PATH=/usr/bin:/bin`.
  - O painel de estilo do Excalidraw (~220px à esquerda) cobre o arrasto em x=200; o retângulo é desenhado em x>=420.
