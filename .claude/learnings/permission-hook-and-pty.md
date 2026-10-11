# Hook PermissionRequest, timeout e Claude em pty (spike 013)

Executado em 2026-10-11 com Claude Code **2.1.296** (Linux, Node 22.19, zsh), `node-pty` 1.1.0, Electron 44.7.0 (Node 24.21 embutido), pnpm 9.15.9. Scripts e fixtures em `.claude/learnings/spike-scripts/`. Legenda: **CONFIRMADO**, **FALSO** (premissa do PRD errada), **DIFERENTE**, **NÃO VERIFICADO**.

Resumo: o formato de saída e o payload estão como o PRD supunha, mas a premissa central do fluxo está **FALSA**: o prompt do terminal **aparece imediatamente e em paralelo** com o hook; o hook não "segura" o prompt, ele corre contra ele. Isso muda a semântica de "Deixar para o terminal", o encerramento de pendências e a copy da UI (specs 014, 015, 016).

## 1. PermissionRequest

### Entrada (stdin do hook)
Fixtures reais em `spike-scripts/fixtures/permission-request.main.json` e `.subagent.json`.

Campos: `session_id`, `transcript_path`, `cwd`, `prompt_id`, `permission_mode`, `effort{level}`, `hook_event_name:"PermissionRequest"`, `tool_name`, `tool_input` (mesmo shape do PreToolUse; Bash tem `command` e `description`), `permission_suggestions[]` (ex.: `{type:"addDirectories",directories:[...],destination:"session"}`). Em sessão interativa (pty) aparece também `scratchpad_dir`.

- **Subagente: CONFIRMADO.** Quando um subagente pede, o payload traz `agent_id` (ex. `a35a2e5df361b1221`, mesmo formato do `SubagentStart`) e `agent_type` (ex. `general-purpose`). `session_id` e `transcript_path` continuam sendo os da sessão principal. Ou seja, `actorId = agent_id ?? session_id`, exatamente a regra do normalizer. Sem `agent_id` = Tech Lead.
- **DIFERENTE: não há `tool_use_id`** no PermissionRequest (docs: "sem tool_use_id"). Para correlacionar com o `PreToolUse`/`PostToolUse` (que têm `tool_use_id`) é preciso casar por `session_id` + `agent_id` + `tool_name` + `tool_input` iguais ao último PreToolUse ainda sem PostToolUse.
- O comando do hook roda via `sh -c`; o stdin é o JSON em uma linha. Hooks de usuário em `~/.claude/settings.json` e do projeto rodam **em paralelo** (o `notify-send` do usuário rodou junto com o nosso).

### Saída
- **allow** `{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"allow"}}}`: **CONFIRMADO** (a ferramenta executou; no log de decisão do stream-json: `permission_decision {decision:"accept", source:"hook"}`). Funciona com o prompt do terminal já na tela: o prompt some e a ferramenta roda.
- **deny com message** `{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"deny","message":"..."}}}`: **CONFIRMADO.** O texto chega ao Claude literalmente (o modelo citou `SPIKE_DENY_MARKER: ...` palavra por palavra) e a ferramenta não roda. Campos extras documentados e não testados: `interrupt:true` (deny, para o Claude), `updatedInput` e `updatedPermissions` (allow). Deny/ask rules continuam valendo mesmo com allow do hook.
- **saída vazia + exit 0: CONFIRMADO** cai no fluxo normal. Em modo interativo o prompt do terminal continua na tela. Em `claude -p` (print) **não há prompt**: o pedido é negado automaticamente com a mensagem "needs approval" (portanto testes de hook com `-p` só valem para allow/deny).
- `exit 1` (com stderr): erro não bloqueante, prompt do terminal continua. `exit 2`: no 2.1.296 interativo o prompt **continuou** na tela (não virou deny nos 8 s observados), então **não usar exit 2**; a regra do CLI é: sem decisão = exit 0 sem stdout.
- **Regra permitida não dispara o hook: CONFIRMADO.** `Bash(echo allowed-by-rule:*)` rodou sem disparar nada (0 novas linhas no log). Também **não dispara** em `permission-mode` auto (sessão com "auto mode on" não gerou nenhum PermissionRequest) nem para `acceptEdits` nas edições que ele aprova sozinho (esse último: pela doc, não testado). Só o modo `default` (a UI chama de "manual") foi verificado a disparar.

### Sequência de eventos (um pedido respondido **no terminal**, hook dormindo)
`PreToolUse(tool_use_id=X)` -> `PermissionRequest` (+0,2 s) -> ~6 s depois `Notification{notification_type:"permission_prompt"}` -> (usuário responde no terminal) `PostToolUse(tool_use_id=X)` -> `Stop`. Ver `fixtures/permission-request.interactive-extra.txt`.

## 2. Espera e timeout

- **Premissa "o prompt do terminal não aparece enquanto o hook segura": FALSO.** Com o hook dormindo 60 s, o prompt "Do you want to proceed?" apareceu no terminal em ~0,1 s depois do START do hook (medido: START 742.337, prompt visto 742.454) e ficou na tela durante os 60 s. Quem responder primeiro vence.
- Responder no **terminal** primeiro: a ferramenta roda (CONFIRMADO) e **o processo do hook continua vivo** (nem o PostToolUse o mata); ele só morre quando termina sozinho ou quando a sessão do Claude acaba (após matar o claude o processo sumiu em poucos segundos). Logo, o daemon precisa **descobrir sozinho** que o pedido foi respondido fora (ver decisões).
- Responder pela **UI** (hook devolve allow após 60 s): o prompt é dispensado e a ferramenta executa (CONFIRMADO: arquivo criado ao fim da espera). Deny: prompt some e o Claude recebe a mensagem.
- Liberar sem decisão (saída vazia após N s): o prompt **já estava lá** e continua (CONFIRMADO, 12 s de espera, prompt na tela do início ao fim). "Reaparecer" não se aplica: ele nunca saiu.
- **Matar o processo do hook** no meio (SIGKILL no hook e no wrapper): o Claude Code segue normalmente; o prompt do terminal continua e espera o usuário (CONFIRMADO). Nenhuma mensagem de erro visível.
- **Estouro do `timeout`** (testado com 5 s e hook dormindo 30 s): em 5 s o hook é morto (pid sumiu), o prompt do terminal segue na tela, a sessão não trava (CONFIRMADO). Falha segura como o PRD supunha.
- **Valores de `timeout` aceitos** (campo em **segundos**, número positivo): 600, 3600, 86400 e 99999999999 foram aceitos (o hook foi registrado e disparou). Com `timeout` 2147483, 2147484 e 99999999999 o hook **não** foi morto cedo em 14 s (descarta overflow de `setTimeout` de 32 bits, que mataria em ~1 ms). `0`, `-5` e `"abc"` **invalidam a entrada do hook** (ele simplesmente não dispara; sem erro visível no `-p`). Não encontrei teto documentado; o teto efetivo real (clamp interno) é **NÃO VERIFICADO**, assim como o default quando o campo é omitido (não esperei 600 s). Decisão: gravar **`timeout: 86400`** (24 h): já é "indeterminado" na prática, é inteiro e foi testado aceito.

## 3. Claude em pty

- **Hooks disparam e transcript é criado: CONFIRMADO** com `node-pty` + `claude --permission-mode default`, cwd temporário: SessionStart, UserPromptSubmit, PreToolUse, PermissionRequest, Notification, PostToolUse e Stop chegaram e `~/.claude/projects/<slug do cwd>/<session_id>.jsonl` foi criado (o `transcript_path` do payload existe).
- **ARMADILHA: ambiente herdado.** Se o processo que cria o pty foi ele mesmo iniciado por um Claude Code, o pty herda `CLAUDECODE`, `CLAUDE_CODE_CHILD_SESSION` etc. e o Claude filho exibe "Transcript saving is off" e **não grava transcript** (verificado: `transcript_path` não existiu). O `SessionManager` deve **remover do env do pty** `CLAUDECODE`, `CLAUDE_CODE_*` (menos o que o usuário configurou de propósito, como `CLAUDE_CODE_USE_BEDROCK`), `CLAUDE_EFFORT` e `CLAUDE_PID`. Vale também para o app Electron aberto de dentro de uma sessão do Claude (dev). Código em `spike-scripts/ptylib.cjs` (`cleanEnv`).
- **Variável de ambiente no hook: CONFIRMADO.** `AGENTS_OFFICE_TERMINAL_ID=term-XYZ-123` passada ao pty apareceu no ambiente do processo do hook PermissionRequest (e herdada por todos os hooks, pois são filhos do `claude`). Não vem no payload, só no env: o `hook` CLI lê `process.env.AGENTS_OFFICE_TERMINAL_ID` e inclui no POST. Não testei se um hook disparado por subagente também a vê (deve, mesmo processo pai); o vínculo só precisa do `SessionStart`.
- **Diálogo de confiança da pasta (novo):** em pasta nunca aberta o Claude interativo mostra "Quick safety check ... Yes, I trust this folder / No, exit" com o cursor **em "No, exit"** (Enter sem mover sai do app). Avisa também de permissões pré-aprovadas em `.claude/settings.local.json`. `claude -p` pula o diálogo. O app não deve injetar entrada: o usuário responde no terminal embutido; a UI precisa dizer isso. NÃO VERIFICADO se hooks de `~/.claude/settings.json` já disparam antes da confiança ser aceita.
- **Modos de permissão:** `--permission-mode default` testado. Sem a flag, a sessão do usuário subiu em "auto mode" (`autoMode` no settings do usuário) e **nenhum PermissionRequest foi emitido**. Se o modo escolhido auto-aprova, o cartão nunca aparece. Modos documentados: `default`, `auto`, `acceptEdits`, `dontAsk`, `bypassPermissions`, `plan`.
- **Achar o `claude` fora de um shell interativo (zsh, Linux):** `claude` está em `~/.local/bin/claude` (symlink para `~/.local/share/claude/versions/<v>`). Com PATH mínimo (`/usr/local/bin:/usr/bin:/bin`, o de um app lançado pelo menu gráfico): **não achado**. `$SHELL -lc 'command -v claude'` (login não interativo): **não achado** (o PATH está no `.zshrc`). `$SHELL -ilc 'command -v claude'` (login interativo): **achado**, ~0,6 s. Receita: `execFile($SHELL, ['-ilc', 'printf "__AO_S__%s__AO_E__" "$PATH"'])` com timeout (~5 s), stdin fechado, extrair o PATH entre os marcadores (ruído de rc é comum), procurar `claude` nele; fallback: `~/.local/bin`, `~/.claude/local`, `/usr/local/bin`, `/opt/homebrew/bin`, `~/.bun/bin`, `~/.npm-global/bin`; cache do resultado; caminho manual na config. O pty deve receber esse PATH resolvido (o `claude` herda o PATH para rodar `node`, hooks, MCP). bash/fish não testados (macOS zsh também NÃO VERIFICADO). `code` está em `/snap/bin/code` (via snap), fora do PATH mínimo.
- **node-pty em Electron (Linux): CONFIRMADO.** `node-pty` 1.1.0 usa `node-addon-api` (N-API, ABI estável) e **não traz prebuilds para Linux** (só darwin e win32): no Linux compila com node-gyp no `install` (precisa `g++`, `make`, `python3`; levou segundos). Com `electron@44.7.0`: carregou e rodou um pty **mesmo sem rebuild**; `@electron/rebuild -f -w node-pty` também concluiu (5 s) e o teste (`spike-scripts/electron-pty-main.js`) devolveu `PTY_OK_T1` + `stty size` `30 100` (resize e env corretos). `pnpm add node-pty` com pnpm 9.15.9 roda o postinstall (compilou e carregou); pnpm 10+ exigiria `onlyBuiltDependencies`. **NÃO VERIFICADO:** macOS (há prebuilds darwin-arm64/x64), empacotamento real com electron-builder/asar (`asarUnpack` para `node-pty`), Electron com o `claude` real dentro do app.

## Decisões que mudam os specs seguintes

1. **Cartão e prompt do terminal coexistem.** "Deixar para o terminal" vira só "dispensar o cartão" (o prompt já está lá). A UI deve avisar que o terminal também está perguntando; aprovar/negar pela UI fecha o prompt do terminal sozinho.
2. **Pendência resolvida fora da UI.** O broker precisa de `resolveExternally`: ao chegar (por `/hook`) PostToolUse/PostToolUseFailure/PermissionDenied correlacionado, ou Stop/UserPromptSubmit/SessionEnd da mesma sessão (e, para subagente, SubagentStop), remover o cartão (`permission.resolved` com `by:"terminal"`) e responder 204 ao long-poll para o processo do hook `hook` terminar (ele não morre sozinho). Correlação por `session_id`+`agent_id`+`tool_name`+`tool_input` (não há `tool_use_id`).
3. **Falha segura continua valendo**: matar/estourar/sair sem decisão cai no prompt, que já estava na tela. Nenhuma sessão fica presa, e a liberação imediata sem UI é inofensiva.
4. **`timeout` do hook = 86400** (segundos); nunca 0/negativo/string.
5. **Sair sem decisão = exit 0 e stdout vazio**; nunca exit 2.
6. **pty:** limpar `CLAUDE_CODE_*`/`CLAUDECODE`; PATH do shell de login interativo (`-ilc`); injetar `AGENTS_OFFICE_TERMINAL_ID`; aviso do diálogo de confiança; modos `auto`/`bypass` não geram cartões.
7. **`claude -p` não serve de E2E do cartão** (não há prompt; vira deny automático). Para E2E real use pty interativo (`scenario-*.cjs`), para os testes automatizados do repo continue com `claude` falso + POST direto.

## Divergências em relação aos PRDs
- desktop-app-permissions, Solução e US 17-18/23: o texto "como o prompt do terminal faria"/"o terminal recebe o prompt normal" parte de que o prompt é suprimido durante a espera; na verdade ele está sempre visível e em paralelo.
- Premissa 2 do PRD (prompt não aparece, reaparece ao liberar): FALSA.
- PRD terminal-sessions, premissa de resolução do `claude` por `$SHELL -lc`: insuficiente, precisa `-ilc` (ou PATH do `.zshrc`).
- Vínculo aba ↔ sessão por env var: CONFIRMADO; "plano B por cwd+tempo" fica só como contingência.
- Novo, não previsto: ambiente herdado desliga o transcript; diálogo de confiança da pasta; modo auto não gera PermissionRequest; processos de hook ficam vivos após resposta no terminal.

## Como repetir
`spike-scripts/`: `perm-hook.sh` (hook de log com modos `allow|deny|empty|exit1|exit2|sleep:N[:allow]`), `log-hook.sh` (loga todos os eventos), `ptylib.cjs` (pty + terminal headless `@xterm/headless` para saber o que está na tela), `scenario-basic|term-first|gen.cjs`, `run-scenario.sh`, `electron-pty-main.js`. Pré-requisitos fora do repo: pasta temporária com `node-pty` e `@xterm/headless` instalados (`NODE_PATH`), projeto temporário com `.claude/settings.local.json` apontando o hook (nunca o `~/.claude/settings.json`). Os caminhos do scratchpad em `run-scenario.sh` são da máquina da execução; ajuste `SP`.

## Implementação do broker (spec 014)
- `POST /hook/permission` detecta o fim do hook por `reply.raw.on('close')` (não `request.raw`: o `close` do request dispara quando o body termina). Desliga o timeout com `request.raw.setTimeout(0)` + `socket.setTimeout(0)`.
- Mensagens de permissão só vão para clientes `/stream?role=ui`; `permission.snapshot` é enviado logo após `snapshot` a eles. Sem cliente UI = 204 imediato.
- Mensagens-envelope do `ServerMessage` são `z.object` (não loose) para o `kind` estreitar a união; `officeClient.ts` do web passou a ignorar `kind !== 'event'`.
- `resolveExternally` compara `tool_input` com JSON de chaves ordenadas; PostToolUse resolve só o pendente mais antigo que casa.

## Implementacao do hook CLI e SettingsMerger (spec 015)
- `hook.ts` escolhe a rota por `hook_event_name`: `PermissionRequest` -> `/hook/permission` sem timeout (200 imprime o corpo no stdout; 204/erro/SIGTERM = nada, exit 0); demais -> `/hook` com 300 ms. `AGENTS_OFFICE_TERMINAL_ID` vira o campo `terminalId` do corpo (campo opcional no `HookPayloadSchema`).
- SIGTERM/SIGINT/SIGHUP abortam o fetch: o socket fecha e o broker resolve com `by:'hook-gone'` (testado enviando SIGTERM ao processo real).
- `KNOWN_HOOK_EVENTS` **nao** inclui `PermissionRequest` de proposito: o normalizer faz switch exaustivo e fixtures por evento; o PermissionRequest nunca passa por `/hook`. Somente `HOOK_EVENTS` (merger) ganhou o evento.
- Merger: `timeout: 86400` so na entrada do PermissionRequest (e re-aplicado se a entrada nossa ja existir sem ele); `matcher: '*'` incluso. Migracao de instalacao antiga = so adiciona o evento novo; uninstall continua byte a byte.
- Eventos que o broker usa para `resolveExternally` (PostToolUseFailure, PermissionDenied) **nao** estao em `HOOK_EVENTS`, entao hoje so PostToolUse/Stop/UserPromptSubmit/SessionEnd/SubagentStop resolvem pendencias respondidas no terminal.

## Web: PermissionCard (spec 016)
- `OfficeClient` connects to `/stream?role=ui` (`defaultStreamUrl`), keeps the queue (`getPermissions()`, event `permissions`) with the pure reducers of `ui/permissionLogic.ts` and `decide()` removes the request locally after sending `permission.decide`. The queue is emptied when the socket drops: the daemon releases every pending request when the last UI client leaves, so a reload of the only open window ends the pending requests (hooks get 204, the terminal prompt stays). E2E for the snapshot therefore needs a second window.
- Card keys: Y approve, N opens the reason field (Enter sends the deny, Esc goes back), T leaves it to the terminal. While typing, `isTyping` blocks movement and the other shortcuts. Z/Enter never approve (too easy to hit by accident).
- HUD `! n` = pending requests + waiting actors that do not already have a pending request (no double count: the Notification makes the same actor `waiting` ~6 s later). The `!` balloon is forced through `CharacterController.setAsking(actorIds)` so it shows at once, before the Notification arrives.
- `window.__office.permissions` = `{ queue, cardOpen, typing }`; `actions.decidePermission(id, decision)`. Phaser only delivers keys fast enough in E2E when `keyboard.type` has a small delay.
