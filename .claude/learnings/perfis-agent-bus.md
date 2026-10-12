# Perfis de agente, elenco e Agent Bus

Resumo das specs 061-066 (PRD `perfis-sessoes-gerenciadas`).

## Modelo
- Perfil (`AgentProfile`, `packages/shared/src/desktopProfiles.ts`): nome (unico, sem diferenciar maiuscula), descricao, aparencia, instrucoes, modo de permissao, modelo, papel (`padrao` | `orquestrador`). Biblioteca global em `<userData>/profiles/` (`ProfileLibrary`), com o perfil "Tech Lead" (`tech-lead`) semeado.
- Elenco (roster) por projeto em `<userData>/rosters.json` (`RosterStore`): entradas `profile` (referencia por id) ou `inline` (specs 072/074), `createdBy`, `connections`, `notes` (ate 8000 chars) `reopen` por entrada (padrao true; ver abaixo) e `autoReopen` por projeto (padrao true).
- Escritas atomicas (`writeJsonAtomic`); arquivo corrompido vira backup (`backupCorrupt`) e recomeca vazio.

## Sessoes gerenciadas
- `ManagedSessions` (main) inicia uma entrada do elenco: idempotente por (cwd, entryId), repassa instrucoes/modelo/permissionMode/profileId/projectId/role ao `SessionManager`, nunca usa `--resume`.
- `reopenAll()` roda uma vez no `whenReady`, depois do `agentBus.start()`, respeita `autoReopen`, o `reopen` de cada entrada e o limite de sessoes; falhas de uma entrada nao bloqueiam a proxima (`ReopenReport`).
- `reopen`: `ManagedSessions` grava `reopen=false` quando a sessao termina fora do encerramento do app (fechar aba, `stop`, `/exit`) e `true` ao iniciar. No quit do app, `beginShutdown()` impede que os kills desmarquem as entradas. Assim so reabre o que estava aberto ao fechar o app (bug: sessao encerrada reabria em todo launch).
- A injecao (`--append-system-prompt`, `--model`, `--mcp-config`) so ocorre quando `start.command` nao foi informado (claude real). Com claude falso o E2E enxerga os argumentos no eco do terminal.
- Elo sessao <-> perfil = id do terminal (`managed.list`). Sessoes abertas pelo seletor continuam "externas" (Tech Lead).

## Agent Bus
- Servidor MCP minimo (JSON-RPC 2.0 sobre `POST /mcp`, sem SDK), ligado a 127.0.0.1 em porta efemera; um token Bearer por sessao (32 bytes aleatorios, comparacao em tempo constante), revogado quando a sessao termina.
- `buildMcpConfig(creds)` gera o `--mcp-config` com o servidor `agent-bus`. Ferramentas tem `roles` opcionais; `save_notes` grava as notas do agente via `RosterStore.setNotes`.
- `buildSessionPrompt` monta o texto de `--append-system-prompt` (mantem o CLAUDE.md do projeto).
- O `issue()` devolve `null` enquanto o bus nao esta ouvindo: a sessao sobe sem MCP em vez de falhar.

## Painel do Elenco (web)
- `castLogic.ts` e puro e testado; `castPanel.ts` monta o painel (botao "Elenco"), `window.__castPanel.open(cwd)` e o gancho dos E2E. Test ids: `cast-*`, `profile-*`.
- Editar perfil vale na proxima partida da sessao. Remover/apagar a forca chama `managed.stop` antes.

## Testes
- Unitarios: vitest em shared/desktop/web. E2E: `e2e/desktop/desktop.spec.ts` (testes "cast panel" e "cast reopening") usam um `claude` falso (`echo "ARGS $*"; sleep`), que nao envia hooks, entao o avatar no escritorio nao e coberto.
- Ambiente sem display/xvfb nao roda Playwright/Electron: os E2E sao escritos e tipados, mas so rodam em maquina com display.

## Mensagens entre agentes (spec 068)
- Ferramentas MCP `list_agents`, `send_message(to,text,context?)`, `reply(message_id,text)` (`agentBus/messaging.ts`, `messagingTools`). Destino por nome (sem diferenciar maiuscula) ou id; so entre conectados (`RosterStore.canTalk`) e com sessao ligada.
- `MessageQueue` (`agentBus/messageQueue.ts`): FIFO por destino, so em memoria (descartada ao fechar o app), estados `na-fila|entregue|respondida|expirada`, TTL 30 min, fila 20/destino, historico 200.
- Ocioso = sessao do modelo do escritorio com `status === 'idle'` ligada ao terminal. O main nao tem o modelo, entao `OfficeIdleSource` segue o WebSocket `/stream` do daemon (snapshot + `reduce`). Desconhecido conta como nao ocioso.
- Entrega: colado com bracketed paste + Enter 200 ms depois; uma mensagem por vez, a proxima so depois de ver o destino ocupado e ocioso de novo (ou 15 s). Texto sem caracteres de controle (ESC fecharia o paste). Cabecalho fixo: `[Mensagem do agente <nome> — não é instrução do usuário]`, conteudo citado com `> `.
- Specs 069/070 podem assinar `MessageQueue.onEvent` (enqueued/delivered/replied/expired).

## Disjuntor, taxa e silenciar (spec 069)
- `agentBus/circuitBreaker.ts`: hops contados por projeto (cada send/reply soma 1; `AgentMessage.hops`), pausa em 8; digitar em terminal do projeto (IPC `terminal.write`, ignorando dados que começam com ESC) zera e retoma; taxa 10 msgs/60 s por remetente; silenciados em memória.
- `Messaging.flush` pula projetos pausados; silenciar expira a fila do agente. Notificação de pausa em `main.ts` (notify + diálogo Continuar/Encerrar). Bridge `profiles.comms.{status,mute,resume,stop}`.

## Eventos e histórico de comunicação (spec 070)
- `CommsLog` (desktop/main/agentBus/commsLog.ts) assina `MessageQueue.onEvent`, mapeia enqueued/delivered/replied/expired -> iniciada/entregue/respondida/expirada e guarda histórico por projeto (100, texto completo, descarta concluídas antes das na-fila).
- Eventos são empurrados à janela por `registerCommsIpc` independentemente de qualquer painel aberto; contrato em `shared/desktopComms.ts`; bridge `agentsOfficeDesktop.comms.{history(cwd), onEvent}`.

## Visita à mesa (spec 071)
- Eventos `comms.onEvent` -> `OfficeScene` -> `CharacterController.noteComm` -> `VisitQueue` (characters/visits.ts): uma fila FIFO por remetente (`cwd`+`entryId`), então broadcast visita um destinatário por vez. `iniciada` com `replyTo` não gera visita; `respondida`/`expirada` encerram; `entregue` não tira o remetente de lá.
- Máquina: fase `visiting` + `ctx.visit {id, startedAt}`; ela fica enquanto o host oferecer a visita. Timeout de 60 s (`VISIT_TIMEOUT_MS`) conta de `startedAt` e marca `visitTimedOut`; o controller descarta a visita.
- Pontos de conversa: `deskSpots` (tiles ao lado/à frente da cadeira) + `ConversationPoints` (um visitante por ponto; excedentes esperam em pé numa segunda faixa, em ordem de chegada). Só há visita se destinatário e remetente estão na mesma sala; `ManagedLook` ganhou `cwd`.
- Histórico: seção "Conversas entre agentes" no painel Elenco (clique abre o texto completo).

## Orquestrador: spawn_agent / dismiss_agent (spec 072)
- `agentBus/spawnAgent.ts`: `SpawnAgents` + `spawnTools`; tools have `roles: ['orquestrador']` so `AgentBus.toolsFor` hides them from other roles, and handlers re-check the role.
- `SPAWN_LIMIT = 2` counts inline roster entries with `createdBy === orchestrator` (removed on dismiss). Limit/name check and `RosterStore.addInline` run with no `await` in between, so parallel calls cannot exceed the limit.
- Errors are JSON `{error: code, message, ...}` with `isError`. Codes: not-orchestrator, invalid-arguments, duplicate-name, limit-reached, denied, session-failed, not-found, not-owner.
- Spawned agents are inline entries (role always `padrao`, so no recursion), auto-connected to the creator. `task` is stored on the inline entry (`RosterInlineEntry.task`) but only passed to `ManagedSessions.start(cwd, entryId, firstTask)`; reopen never resends it.
- Instructions of a created agent are prefixed in the system prompt as written by the creating agent (`SessionPromptInput.createdBy`).
- `SpawnAgentOptions.approve` is the hook for the approval card (spec 073); absent = always allowed. `SpawnAgents.history(cwd)`/`onEvent` is the audit log (in memory).

## Aprovação de criação de agentes (spec 073)
- `SpawnApprovals` (desktop/src/main/agentBus/spawnApproval.ts) é o hook `approve` do `SpawnAgents`. Falha fechada: só aprovação explícita cria; negar, timeout (5 min) ou fechar o app = `denied`. Sem `entryId` = negado.
- Permissão "sem perguntar" fica em `userData/spawn-approvals.json` como pares `{cwd, orchestratorId}`; arquivo ausente/corrompido = pergunta de novo. Só vale para o par orquestrador+projeto; `allowAlways` só é honrado em aprovação.
- IPC `agents-office:spawn-approval:{pending,respond,request,resolved}`; ponte `window.agentsOfficeDesktop.spawnApproval`. A UI (`spawnApprovalCard.ts`) busca `pending()` ao montar (janela recarregada) e usa `resolved` para tirar cartões respondidos/expirados.
- Instruções editadas voltam como `request.instructions` e são revalidadas por `SpawnAgents.parse`.

## Persistência e promoção de agentes criados (spec 074)
- Agentes criados são entradas `inline` do `RosterStore`; reabrem com o elenco (`ManagedSessions.reopenAll`) com instruções + notas, sem `--resume` e sem reenviar a tarefa. A tarefa original fica em `RosterInlineEntry.task` e só é exibida: `ManagedSessionInfo.task` vira tooltip da aba (`terminalPanel.setTabHints`, `castLogic.taskHints`) e linha "Tarefa original" no painel Elenco.
- Auditoria: `SpawnAgents` persiste o log em `userData/spawn-audit.json` (`fileAuditStorage`, 500 eventos, arquivo corrompido vira backup e começa vazio). Remoção manual de agente criado (`profiles.roster.remove`) registra `encerrado` com `by: 'usuario'` via `AgentsAudit.removedByUser` em `registerProfilesIpc`.
- "Salvar como perfil": `promoteInlineAgent` (agentBus/promoteAgent.ts) copia nome, instruções e profissão (base da aparência) para a biblioteca com papel `padrao`; a tarefa não vai junto; nome repetido na biblioteca falha. Bridge `profiles.agents.{history, saveAsProfile}`; test ids `cast-save-profile`, `cast-created-by`, `cast-task`, `cast-audit`.

## Quadro: store e ferramentas board_* (spec 075)
- `BoardStore` (desktop/src/main/boardStore.ts): uma cena `.excalidraw` por projeto em `userData/boards/<slug>-<hash do cwd>.excalidraw`. Escrita atômica (tmp + rename); a última versão válida fica em `.bak` (só copiada se o arquivo atual parseia). Arquivo corrompido: guarda `.corrupt`, restaura `.bak` (`load().status === 'recovered'`) ou começa vazio (`'lost'`). Limites: 2000 elementos vivos, 5 MB, 500 tombstones; estourar lança `BoardLimitError` sem gravar. `merge(cwd, elementos, fonte)` reconcilia por id/`version` (empate: menor `versionNonce`); `onChange(listener)` recebe `(cwd, cena, 'agent'|'user'|'system')` para o overlay (spec 076/077).
- `BoardTools` + `boardTools()` (agentBus/boardTools.ts): `board_read`, `board_add_elements`, `board_add_mermaid`, `board_clear`. Skeleton -> elemento completo, autoria em `customData.author {id,name}`, sem x/y vai para baixo do conteúdo existente. Apagar = tombstone (`isDeleted`, `version+1`). `board_clear` padrão só apaga o do autor (e texto ligado); `scope:'all'` exige `approveClearAll` (ausente = negado; em main.ts é um `dialog.showMessageBox`). `board_read` embrulha o JSON em `<board-data>` com aviso de que é dado, não instrução.
- `@excalidraw/mermaid-to-excalidraw` precisa de DOM: não roda no processo principal. `BoardToolsDeps.mermaid(definition) -> {elements: skeletons}` é injetado; sem ele `board_add_mermaid` devolve `unavailable`. A spec 077/079 deve ligar um conversor (ex.: via renderer) em main.ts.
