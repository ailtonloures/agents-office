---
title: Normalizer — JSONL do Claude Code e payloads de hook para OfficeEvent
number: 002
priority: high
tags: [feature, daemon, parser, testing]
dependencies: [001-monorepo-scaffold-shared-contracts.spec.md]
related_prd: ../prds/agents-office.prd.md
status: pending
created: 2026-10-10
---

# 002 - Normalizer

## Overview
Módulo profundo e puro que converte linhas JSONL de sessão e subagente, `.meta.json` de subagentes e payloads de hook em `OfficeEvent` canônicos, com deduplicação entre fontes. Também serve de spike (Fase 0): valida o formato real dos transcripts com fixtures anonimizadas.

## Related PRD
- **Source**: [Agents Office](../prds/agents-office.prd.md)
- **Section Reference**: Fontes de dados e correlação; Contrato de eventos; Testing Decisions → Seam 2; Further Notes (parser tolerante)

## Prerequisites
- [ ] Spec 001 concluído

## Dependencies
- `001-monorepo-scaffold-shared-contracts.spec.md`: tipos `OfficeEvent` e `HookPayload`

## Implementation Tasks
### 1. Fixtures (spike)
- [ ] Script `packages/daemon/scripts/capture-fixture.ts <sessionDir>` que copia uma sessão real (JSONL pai + `subagents/*.jsonl` + `*.meta.json`) para `packages/daemon/test/fixtures/<nome>/`, **anonimizando** o texto (prompts, conteúdo de tool_result e paths de home trocados por placeholders) e preservando estrutura, ids, `type`, `tool_use`/`tool_result`, `timestamp`, `cwd`, `isSidechain` e `usage`
- [ ] Fixtures mínimas: `parallel-subagents` (3 subagentes paralelos), `nested-subagent` (spawnDepth 2), `tool-error` (`tool_result` com `is_error: true`)
- [ ] Documentar em `packages/daemon/test/fixtures/README.md` os campos observados (`parentUuid`, `isSidechain`, `agentId`, `message.content[].type`, `toolUseResult`, `message.usage`)

### 2. Normalizer (`packages/daemon/src/normalizer/`)
- [ ] Input discriminado: `{ kind: 'session-line', sessionId, projectSlug, line }`, `{ kind: 'agent-line', sessionId, agentId, line }`, `{ kind: 'agent-meta', sessionId, agentId, meta }` e `{ kind: 'hook', payload }`
- [ ] API: `createNormalizer()` retorna `{ ingest(input): OfficeEvent[] }`. O estado interno se limita a correlação e dedup, sem I/O e sem relógio
- [ ] Regras JSONL:
  - primeira linha de uma sessão desconhecida → `session.started` (cwd da linha; projectId = slug)
  - `assistant` com bloco `tool_use` → `tool.started` (summary curto: path do arquivo, comando truncado em 60 chars, query)
  - `user` com bloco `tool_result` → `tool.finished` (`ok = !is_error`)
  - `assistant` só texto/thinking → `actor.thinking`
  - `message.usage` → `usage`
  - `agent-meta` → `agent.spawned` (agentType, description, spawnDepth, ligado ao pai via `toolUseId`; `parentAgentId` se o `toolUseId` pertencer a um transcript de agente)
  - `tool_result` cujo `tool_use_id` é o `toolUseId` de um meta → `agent.finished`
  - linhas malformadas ou tipos desconhecidos → ignorados, contados num campo `stats.skipped`, nunca lançam exceção
- [ ] Regras hook (`hook_event_name`): SessionStart → `session.started`; SessionEnd → `session.ended{reason:'hook'}`; SubagentStart → `agent.spawned`; SubagentStop → `agent.finished`; PreToolUse/PostToolUse → `tool.started`/`tool.finished`; Notification → `actor.waiting`; Stop → `actor.idle`; UserPromptSubmit → `actor.thinking` (com `lastPromptSummary` truncado)
- [ ] Dedup: chave `(tipo, toolUseId | agentId | sessionId)`; o segundo a chegar (hook ou JSONL) não emite evento duplicado, mas pode enriquecer campos ausentes via um evento `*.updated` opcional ou silenciosamente
- [ ] `ts` sempre da fonte (`timestamp` do JSONL; para hooks, o horário de recebimento passado no input)

### 3. Testing
- [ ] `test/normalizer.jsonl.test.ts`: cada fixture produz a sequência de eventos esperada (snapshot de eventos aprovado e revisado manualmente)
- [ ] `test/normalizer.hooks.test.ts`: cada tipo de hook → evento; hook + JSONL do mesmo `tool_use_id` → um único `tool.started`
- [ ] `test/normalizer.robustness.test.ts`: linha truncada, JSON inválido e `type` desconhecido não lançam exceção

## Acceptance Criteria
### Must Have
- [ ] Normalizer sem imports de `fs`, `net` ou relógio (puro)
- [ ] As 3 fixtures passam com eventos corretos, incluindo o vínculo pai-filho e `agent.finished` inferido
- [ ] Nenhuma fixture contém conteúdo pessoal (revisão manual + grep por `/home/`)

### Should Have
- [ ] README de fixtures documentando o formato observado

## Testing Requirements
```bash
pnpm --filter @agents-office/daemon test normalizer
pnpm typecheck && pnpm lint
```

## Rollback Plan
Remover `packages/daemon/src/normalizer/`, `test/fixtures/` e o script de captura.
