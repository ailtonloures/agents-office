---
title: Monorepo scaffold e contratos compartilhados (OfficeEvent/OfficeModel)
number: 001
priority: high
tags: [feature, infra, shared, testing]
dependencies: []
related_prd: ../prds/agents-office.prd.md
status: pending
created: 2026-10-10
---

# 001 - Monorepo scaffold e contratos compartilhados

## Overview
Cria o monorepo pnpm com os pacotes `shared`, `daemon` e `web`, o tooling comum (TypeScript strict, Vitest, Biome) e o contrato canônico `OfficeEvent`/`OfficeModel` com schemas zod. Todos os specs seguintes dependem deste contrato.

## Related PRD
- **Source**: [Agents Office](../prds/agents-office.prd.md)
- **Section Reference**: Implementation Decisions → Módulos (shared), Contrato de eventos, Outras decisões (monorepo pnpm)

## Prerequisites
- [ ] Node >= 20 e pnpm >= 9 instalados
- [ ] `git init` no projeto (ainda não é um repositório)

## Dependencies
- Nenhuma

## Implementation Tasks
### 1. Workspace
- [ ] `package.json` raiz (private, scripts `build`, `test`, `typecheck`, `lint`, `dev`) e `pnpm-workspace.yaml` com `packages/*`
- [ ] `tsconfig.base.json` (strict, `moduleResolution: bundler`, `target: ES2022`) e um tsconfig por pacote
- [ ] `biome.json` (format + lint) e `vitest.workspace.ts`
- [ ] `.gitignore`, `.editorconfig`, `LICENSE` (MIT) e um `README.md` mínimo
- [ ] Pacotes vazios `packages/daemon` (`@agents-office/daemon`) e `packages/web` (`@agents-office/web`), cada um com um script `test` placeholder

### 2. packages/shared
- [ ] `src/events.ts`: schema zod e tipo discriminado `OfficeEvent` com `session.started`, `agent.spawned`, `tool.started`, `tool.finished`, `actor.thinking`, `actor.waiting`, `actor.idle`, `agent.finished`, `session.ended` e `usage`. Todos com `ts` (ISO string) e um `source: 'jsonl' | 'hook' | 'clock'`
- [ ] `src/model.ts`: `OfficeModel { projects: Record<projectId, Project> }`, `Project { id, name, cwd, sessionIds, lastActivityTs }`, `Session { id, projectId, status, currentTool?, recentSteps[], usage, agentIds, lastPromptSummary? }`, `Agent { id, sessionId, parentAgentId?, agentType, description, spawnDepth, profession, status, currentTool?, recentSteps[], usage, startedTs, finishedTs? }`
- [ ] `ActorStatus = 'spawning' | 'thinking' | 'working' | 'waiting' | 'error' | 'idle' | 'finished' | 'ended'`
- [ ] `src/protocol.ts`: mensagens WS `{ kind: 'snapshot', model }` e `{ kind: 'event', event }`, mais o payload de hook aceito (`HookPayload` com campos opcionais tolerantes)
- [ ] `src/index.ts` reexportando tudo

### 3. Testing
- [ ] `packages/shared/test/events.test.ts`: parse válido de cada tipo de evento; rejeição de evento sem `ts`; campos desconhecidos tolerados (`passthrough`)

## Acceptance Criteria
### Must Have
- [ ] `pnpm install && pnpm typecheck && pnpm test && pnpm lint` passam na raiz
- [ ] `@agents-office/shared` importável por daemon e web via workspace

### Should Have
- [ ] README com a visão do projeto e o link para o PRD

## Testing Requirements
```bash
pnpm install
pnpm typecheck && pnpm test && pnpm lint
```

## Rollback Plan
Remover `packages/`, os arquivos de config da raiz e `node_modules`. Não há estado externo.
