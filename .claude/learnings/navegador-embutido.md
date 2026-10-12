# Navegador embutido (spec 080)

- `desktop/src/main/browserHost.ts`: `BrowserHost` keeps one view per workspace (key = cwd without trailing slash), each on `persist:browser-<sha256(cwd)[0:24]>` (`partitionFor`). Views come from an injected `createView` factory (`BrowserViewHandle`), so tests use a fake; the Electron one is `browserViews.ts` (`WebContentsView`, sandbox, no preload, permissions and downloads denied until the prompts of later specs).
- `normalizeAddress` only lets http(s) and about:blank through; hosts get https (http for localhost/IP), other text becomes a DuckDuckGo search.
- The page is a native view over the window, not DOM: the web `browserPane.ts` only draws the toolbar and reports the stage rect (`show`/`setBounds`/`hide`). Anything drawn in the DOM over the stage (dialogs, toasts) is hidden behind the page.
- Closing the dock tab only calls `hide`; the view, page and cookies survive. A main-frame reload of the window hides the view (`did-start-navigation`).
- The browser tab is a `TerminalTab` with `kind: 'browser'` and id `browser:<cwd>`; `shownTerminalId` keeps it out of the office's active-terminal binding.
- The "Navegador" button needs at least one tab (the panel is hidden without tabs) and uses the active tab's workspace.
- Bridge: `agentsOfficeDesktop.browser` (`BrowserBridge` in shared/desktopBrowser.ts), channels in `browserChannels.ts`.

# Ferramentas browser_* via CDP e fila (spec 081)

- `BrowserViewHandle.cdp?: CdpTransport` (`send(method, params)`): in Electron it is `webContents.debugger` (attached lazily with protocol 1.3, detached on destroy). Views without `cdp` make the tools answer `unsupported`.
- `browserDriver.ts` `BrowserDriver` (navigate, click, type, pressKey, evaluateExpression, waitFor) throws `BrowserToolError(code)`; codes: invalid-address, unsupported, element-not-found, timeout, eval-failed, invalid-input, cdp-error. Every CDP call has a timeout (default 10s); `wait_for` caps at 60s. Click = scrollIntoView + center of the rect + mouseMoved/Pressed/Released; type = focus (optional clear) + `Input.insertText`; keys via `parseKey` ("Control+a", "Enter").
- `browserQueue.ts` `BrowserQueue`: one chain per workspace, so actions of two agents never interleave; each carries `{actor, action}`; max 20 waiting (`queue-full`). `BrowserHost` `decorate` adds `agent`/`queued` to `BrowserState`; `host.notify(cwd)` re-pushes; the pane shows "<Agente> está usando o navegador".
- Agent Bus tools (`agentBus/browserTools.ts`): browser_navigate, browser_click, browser_type, browser_press_key, browser_eval, browser_wait_for. Results are JSON with a `notice` that page data is untrusted; errors `{error, message}`.
- Not verified in real Electron (no display): actions on a view that is not attached to the window (tab closed) rely on CDP working for hidden webContents.

## Leitura da pagina (spec 082)
- `browser_snapshot`: `Accessibility.getFullAXTree` -> `buildSnapshot` (browserSnapshot.ts). Refs `eN` so para roles interativos, em ordem de documento; ficam em `BrowserDriver.refs` por workspace e sao substituidas a cada snapshot. `click`/`type` aceitam `ref` (DOM.resolveNode por backendNodeId + Runtime.callFunctionOn); ref desconhecido/sumido -> `element-not-found` pedindo novo snapshot.
- `browser_screenshot` devolve imagem como content `image` do MCP (`BusToolResult.images`), nunca dentro do JSON.
- `browser_console`: o driver assina `CdpTransport.onEvent` no primeiro uso; a view habilita Runtime/Log ao anexar o debugger. Buffer de 200 entradas por workspace; so cobre o que ocorreu depois do primeiro uso.
- Todo texto vindo da pagina (snapshot, entries, value) e coberto por `BROWSER_UNTRUSTED_NOTICE`.

## Confirmações e pausa (spec 083)
- `BrowserApprovals` (desktop/main/browserApprovals.ts) gera os cartões Permitir/Negar para download, permissão de site e `browser_eval`. Falha fechada: negar, timeout (2 min), sair do app, pausa e falha de UI => negado. Canais `agents-office:browser-approval:{pending,respond,request,resolved}`.
- `createBrowserGuard` (browserGuard.ts) liga o `session` do Electron aos cartões: download usa `item.pause()` e depois `resume()`/`cancel()`; permissões `openExternal`/desconhecidas nunca são concedidas; o handler de *check* continua negando.
- "Pausar agentes": `BrowserPause` por workspace (memória), `BrowserBridge.setPaused`, `BrowserState.paused`. As ferramentas devolvem `{error:'paused'}` ("Pausado pelo usuário") antes e depois da fila; pausar nega os cartões abertos do workspace.
- O cartão fica no `gameParent`; a view nativa do navegador pode cobri-lo, por isso também há notificação nativa. Fábrica de views agora recebe `(partition, cwd)`.

## Seletor de elemento (spec 084)
- `browserPicker.ts` `BrowserPicker` (start/cancel/isActive): injeta via CDP (`Runtime.addBinding` `__agentsOfficePick` + `Runtime.evaluate`) um destacador (borda amarela, cursor crosshair) que so reage a eventos `isTrusted`, bloqueia o clique da pagina e devolve seletor, tag, texto, HTML (sem `<script>` nem value de senha) e rect. O payload do binding leva um nonce que so o script injetado conhece; o resto e ignorado (a pagina nao forja um pick). Esc ou 5 min cancelam.
- Limites: texto 2000, HTML 4000 (`normalizePick` trunca e marca `textTruncated/htmlTruncated`); caracteres de controle removidos. Captura do elemento: `Page.captureScreenshot` com `clip` (max 1600px de lado) salva em `userData/browser-picks/*.png` (0600, apagada apos 1h por `createPickScreenshotSaver`); falha de captura nao impede o pick.
- Canais `agents-office:browser:{start-pick,cancel-pick,pick(push)}`; `BrowserBridge.startPick/cancelPick/onPick`, tipos `BrowserPick`, `BrowserPickEvent` em shared/desktopBrowser.ts.
- Web: `browserPickLogic.ts` (`formatPickContext` com rotulo fixo e aviso de dado de terceiros, `ptyPayload` = bracketed paste sem Enter e sem ESC/controles, `pickTargets` = terminais do dock em execucao, mesmo workspace primeiro, `sendPickContext`). O dialogo de revisao (textarea editavel + escolha do agente) fica no `browserPane`; enquanto aberto o painel esconde a view nativa (`coveredBrowser`), pois o DOM ficaria atras dela. Nada vai ao PTY sem o clique em "Enviar ao agente"; o usuario confirma com Enter no terminal.
- Nao testado em Electron real (sem display); o painel/DOM nao tem teste (web sem jsdom).

## Avatar e E2E (spec 085)
- `ruleForTool` (web/characters/characterMachine.ts) mapeia `browser_*` (navigate, click, type, press_key, eval, wait_for, snapshot, screenshot, console; com ou sem o prefixo `mcp__<server>__`) para a atividade `web` na mesa, sem target: o avatar fica olhando o monitor, nunca anda ate um POI, nem com `ROAMING_TOOL_TABLE`. Uma entrada na tabela do usuario ainda vence. Nao ha evento novo: o uso ja chega como `currentTool` do ator.
- E2E: `packages/desktop/e2e/app.e2e.ts` ("embedded browser") usa um servidor HTTP local (duas paginas com titulos diferentes) e a ponte `agentsOfficeDesktop.browser` (show, navigate, back, setPaused, hide); confere os `webContents` pelo processo main. Escrito e tipado, mas nao executado (sem display neste ambiente; precisa de X11/xvfb).
- Pendente de verificacao manual em Electron real: tudo marcado como "nao testado" nas secoes acima (CDP em view oculta, seletor, cartoes, camada nativa sobre o DOM).
