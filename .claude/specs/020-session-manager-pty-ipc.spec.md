---
title: SessionManager — ptys do Claude Code e ponte IPC
number: 020
priority: high
tags: [feature, desktop, pty, ipc, testing]
dependencies: [013-validation-spike-permission-hook-pty.spec.md, 017-desktop-shell-electron.spec.md]
related_prd: ../prds/desktop-terminal-sessions.prd.md
status: pending
created: 2026-10-10
---

# 020 - SessionManager — ptys do Claude Code e ponte IPC

## Overview
Módulo profundo do app que cria, lista, redimensiona e encerra ptys rodando o `claude` num diretório, com buffer circular por sessão (~5.000 linhas) e uma ponte IPC tipada para o renderer. Resolve o caminho do `claude` por shell de login e injeta uma variável de ambiente única por aba.

## Related PRD
- **Source**: [Sessões em terminal embutido e VS Code](../prds/desktop-terminal-sessions.prd.md)
- **Section Reference**: User Stories 7, 10, 14-18; Implementation Decisions → SessionManager

## Prerequisites
- [ ] Specs 013 e 017 concluídos
- [ ] `node-pty` compilando sob Electron (`electron-rebuild`)

## Dependencies
- `013-validation-spike-permission-hook-pty.spec.md`: pty e claude validados
- `017-desktop-shell-electron.spec.md`: processo principal

## Implementation Tasks
### 1. SessionManager (`packages/desktop/src/main/sessionManager.ts`)
- [ ] `start({cwd, resume?, permissionMode?, command?})` → `{id}`; cria o pty com `node-pty`, cwd validado (existe, é diretório), env com `AGENTS_OFFICE_TERMINAL_ID=<id>` e PATH do shell de login; **remover do env herdado** `CLAUDECODE`, `CLAUDE_CODE_*` (exceto escolhas do usuário como `CLAUDE_CODE_USE_BEDROCK`), `CLAUDE_EFFORT` e `CLAUDE_PID` (spike 013: `CLAUDE_CODE_CHILD_SESSION` herdado desliga a gravação do transcript e a sessão não aparece no escritório)
- [ ] `write(id, data)`, `resize(id, cols, rows)`, `kill(id)` (SIGHUP, depois SIGKILL após ~5 s), `list()`, `onData`, `onExit`
- [ ] Buffer circular por sessão (últimas ~5.000 linhas / limite de bytes) e `getBuffer(id)` para reconexão
- [ ] `command` injetável para testes (binário `claude` falso); fábrica de pty injetável para testes unitários
### 2. Resolução de binários (`src/main/binaries.ts`)
- [ ] Achar `claude` via shell de login (`$SHELL -ilc` **interativo**: `-lc` não acha o `claude` quando o PATH está no `.zshrc`; usar marcadores `__AO_S__$PATH__AO_E__` para ignorar ruído de rc, timeout ~5 s, ~0,6 s medido; bash/fish/macOS não verificados) com cache e fallback para caminhos comuns; erro tipado `ClaudeNotFound` com orientação ao usuário
- [ ] Opção de caminho manual salvo na configuração do app
- [ ] Pasta nunca aberta: o `claude` mostra o diálogo "Yes, I trust this folder" com o cursor em "No, exit"; não injetar entrada, o usuário responde no terminal (documentar na UI)
- [ ] Modo de permissão `auto`/`bypassPermissions` não gera PermissionRequest (nenhum cartão); só `default` foi verificado a gerar
### 3. Ponte IPC (`src/preload/`, `src/main/ipc.ts`)
- [ ] Canais tipados: `terminal.start|write|resize|kill|list|buffer` e eventos `terminal.data|exit`; validar remetente e payloads (zod); nunca expor `node-pty` ao renderer
- [ ] Os dados do terminal nunca passam pelo daemon nem são logados
### 4. Testing
- [ ] Unidade: buffer circular, resolução de binários (com ambiente simulado), validação de payloads
- [ ] Integração com pty real: comando simples num dir temporário (saída, resize, kill limpo SIGHUP→SIGKILL, buffer após reconexão); processo `claude` falso que ignora SIGHUP deve ser morto pelo SIGKILL

## Acceptance Criteria
### Must Have
- [ ] pty real inicia, recebe entrada, redimensiona e encerra limpo
- [ ] Erro claro quando o `claude` não existe
- [ ] Renderer não acessa `node-pty` nem o sistema de arquivos

### Should Have
- [ ] Limite de sessões simultâneas configurável

## Testing Requirements
```bash
pnpm --filter @agents-office/desktop test sessionManager binaries ipc
pnpm typecheck && pnpm lint
```

## Rollback Plan
Remover `sessionManager.ts`, `binaries.ts`, `ipc.ts` e a dependência `node-pty`.
