---
title: CLI de hooks — comando hook, install/uninstall/status com SettingsMerger
number: 006
priority: medium
tags: [feature, daemon, cli, hooks, testing]
dependencies: [005-daemon-server-stream-and-hook-receiver.spec.md]
related_prd: ../prds/agents-office.prd.md
status: pending
created: 2026-10-10
---

# 006 - CLI de hooks

## Overview
Adiciona o comando `agents-office hook`, executado pelo Claude Code em cada hook (lê o stdin e faz POST no daemon, sempre exit 0 e rápido), e `hooks install|uninstall|status`, que alteram `~/.claude/settings.json` de forma idempotente, reversível e com backup. Implementa a **Seam 3**.

## Related PRD
- **Source**: [Agents Office](../prds/agents-office.prd.md)
- **Section Reference**: User Stories 3-8; Implementation Decisions → CLI, SettingsMerger; Testing Decisions → Seam 3

## Prerequisites
- [ ] Spec 005 concluído (endpoint `POST /hook` e `/health`)

## Dependencies
- `005-...`: endpoint e CLI base

## Implementation Tasks
### 1. Comando `hook` (`src/cli/hook.ts`)
- [ ] Ler todo o stdin (limite de 1 MB), fazer POST em `http://127.0.0.1:<port>/hook` com timeout de 300 ms
- [ ] Qualquer erro (daemon off, JSON inválido, timeout) → exit 0 sem output no stdout (não interferir no Claude Code)
- [ ] Inicialização leve: entry dedicado sem carregar Fastify/chokidar (alvo < 150 ms de cold start)

### 2. SettingsMerger (`src/cli/settings-merger.ts`)
- [ ] Eventos: SessionStart, SessionEnd, SubagentStart, SubagentStop, PreToolUse, PostToolUse, Notification, Stop, UserPromptSubmit
- [ ] Cada entrada adicionada leva um marcador identificável (comando contendo `agents-office hook`, com matcher `*` onde aplicável) para que o uninstall remova só o que é nosso
- [ ] `install`: backup em `settings.json.agents-office.bak` (só se não existir), merge preservando os hooks existentes e todas as outras chaves; idempotente; formatação JSON com 2 espaços
- [ ] `uninstall`: remove só as nossas entradas; remove arrays/chaves que ficarem vazios **somente** se nós os criamos (resultado idêntico ao original)
- [ ] `status`: instalado sim/não por evento + `GET /health` do daemon (`hooksSeenAt`)
- [ ] Respeitar `--settings <path>` e `HOME` (para os testes)
- [ ] Comando do hook usando o caminho absoluto do binário resolvido (evitar depender do PATH do Claude Code)

### 3. Testing (Seam 3)
- [ ] `test/hooks-cli.test.ts` com HOME temporário:
  - settings inexistente → install cria → uninstall remove o arquivo/estado criado
  - settings com hooks de terceiros → install → uninstall → **byte-a-byte idêntico** ao original
  - install 2× → sem duplicatas
  - `hook` com daemon off → exit 0 em < 500 ms; com daemon on → evento chega ao WS

## Acceptance Criteria
### Must Have
- [ ] Os testes da Seam 3 passam
- [ ] O settings do usuário real **não** é tocado pelos testes

### Should Have
- [ ] `hooks install --dry-run` mostrando o diff

## Testing Requirements
```bash
pnpm --filter @agents-office/daemon test hooks-cli
pnpm typecheck && pnpm lint
```

## Rollback Plan
`agents-office hooks uninstall` ou restaurar `settings.json.agents-office.bak`; remover `src/cli/hook.ts` e `src/cli/settings-merger.ts`.
