---
title: Daemon — StreamServer (WS), HookReceiver (HTTP) e comando start
number: 005
priority: high
tags: [feature, daemon, api, websocket, testing]
dependencies: [003-office-model-reducer-liveness.spec.md, 004-transcript-watcher.spec.md]
related_prd: ../prds/agents-office.prd.md
status: pending
created: 2026-10-10
---

# 005 - Daemon server

## Overview
Junta Watcher → Normalizer → Reducer/Liveness num processo único. Expõe `POST /hook` (recebe payloads de hook), `GET /stream` (WebSocket com snapshot e depois eventos), `GET /health` e serve os estáticos da web. Bind exclusivo em 127.0.0.1. Este spec implementa a **Seam 1** (daemon caixa-preta).

## Related PRD
- **Source**: [Agents Office](../prds/agents-office.prd.md)
- **Section Reference**: User Stories 1-2, 9-10, 37, 47; Implementation Decisions → HookReceiver, StreamServer, CLI(start); Testing Decisions → Seam 1

## Prerequisites
- [ ] Specs 003 e 004 concluídos

## Dependencies
- `003-...`: reducer e liveness
- `004-...`: watcher

## Implementation Tasks
### 1. Core (`packages/daemon/src/server/`)
- [ ] `createDaemon({ port, host:'127.0.0.1', projectsDir, config, clock })` com `start()`/`stop()`; o clock é injetável
- [ ] Pipeline: inputs → `normalizer.ingest` → para cada evento `model = reduce(model, e)` → broadcast `{kind:'event'}`
- [ ] Liveness: `setInterval` de 5 s chamando `tick(model, clock.now())` e aplicando/broadcastando os eventos
- [ ] Fastify + `@fastify/websocket`:
  - `GET /health` → `{ ok, version, sessions, agents, hooksSeenAt? }`
  - `POST /hook` → valida `HookPayload` (tolerante), injeta o `ts` de recebimento, responde 204 rápido (processamento assíncrono)
  - `GET /stream` (WS) → envia `{kind:'snapshot', model}` ao conectar e depois cada evento
  - `GET /*` → estáticos de `packages/web/dist` (quando existir)
- [ ] Recusar bind em host diferente de loopback, a menos que `--unsafe-host` seja passado explicitamente

### 2. CLI (`packages/daemon/src/cli.ts`, bin `agents-office`)
- [ ] `agents-office start [--port 4777] [--projects-dir ~/.claude/projects] [--no-open] [--professions path]` com variáveis de ambiente equivalentes (`AGENTS_OFFICE_PORT`, `AGENTS_OFFICE_PROJECTS_DIR`)
- [ ] O comando padrão (sem subcomando) = `start`; abre o navegador com `open`, a menos que `--no-open`
- [ ] Porta ocupada → mensagem clara e exit 1

### 3. Testing (Seam 1)
- [ ] `test/daemon.e2e.test.ts`: daemon com diretório temporário e porta 0; cliente WS conectado:
  - snapshot inicial vazio
  - escrever a fixture `parallel-subagents` incrementalmente → eventos `session.started`, 3× `agent.spawned`, …, 3× `agent.finished` na ordem
  - POST `/hook` PreToolUse + a linha JSONL do mesmo `tool_use_id` → um único `tool.started`
  - clock falso avança 15 min → `session.ended{expired}`; o snapshot de um novo cliente fica vazio
  - `/health` reflete as contagens
- [ ] Teste que garante que o servidor escuta só em 127.0.0.1

## Acceptance Criteria
### Must Have
- [ ] Os testes da Seam 1 passam
- [ ] `pnpm --filter @agents-office/daemon exec agents-office start --no-open` roda contra o `~/.claude/projects` real e `/health` mostra as sessões ativas (verificação manual)

### Should Have
- [ ] Logs concisos no startup (porta, diretório, nº de sessões carregadas)

## Testing Requirements
```bash
pnpm --filter @agents-office/daemon test daemon
pnpm typecheck && pnpm lint
```

## Rollback Plan
Remover `src/server/`, `src/cli.ts` e o campo `bin` do package.json.
