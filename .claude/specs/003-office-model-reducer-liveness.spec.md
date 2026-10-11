---
title: OfficeModelReducer e LivenessClock
number: 003
priority: high
tags: [feature, daemon, state, testing]
dependencies: [001-monorepo-scaffold-shared-contracts.spec.md, 002-normalizer-jsonl-and-hooks.spec.md]
related_prd: ../prds/agents-office.prd.md
status: pending
created: 2026-10-10
---

# 003 - OfficeModelReducer e LivenessClock

## Overview
Reducer puro e determinístico que aplica `OfficeEvent` ao `OfficeModel` (Projects → Sessions → Agents), incluindo profissão, passos recentes e uso de tokens. Inclui também um LivenessClock com relógio injetável que emite `actor.idle` e `session.ended{reason:'expired'}`. Isso habilita o replay futuro.

## Related PRD
- **Source**: [Agents Office](../prds/agents-office.prd.md)
- **Section Reference**: User Stories 11-12, 15, 17-28; Implementation Decisions → OfficeModelReducer, LivenessClock, Outras decisões (limiares)

## Prerequisites
- [ ] Specs 001 e 002 concluídos

## Dependencies
- `001-...`: tipos do modelo
- `002-...`: fixtures e eventos reais para os testes

## Implementation Tasks
### 1. Reducer (`packages/daemon/src/model/reducer.ts`)
- [ ] `reduce(model, event): OfficeModel`, puro e imutável
- [ ] Cria o Project sob demanda (nome = basename do cwd) e atualiza `lastActivityTs`
- [ ] `agent.spawned` → Agent com `status:'spawning'` e `profession` resolvida
- [ ] `tool.started` → `working` + `currentTool`; adiciona a `recentSteps` (máx. 5, FIFO)
- [ ] `tool.finished{ok:false}` → `error`; `ok:true` → `thinking`
- [ ] `actor.waiting`/`actor.idle`/`actor.thinking` → status correspondente
- [ ] `agent.finished` → `finished` + `finishedTs`; mantém um array `hallOfFame` (últimos 20 concluídos) no modelo
- [ ] `session.ended` → `ended`; remove a sessão e os agentes ainda vivos do modelo ativo; remove o projeto sem sessões
- [ ] `usage` → acumula input/output tokens
- [ ] Eventos para atores desconhecidos criam placeholders (tolerância à ordem: hook antes do JSONL)

### 2. Professions (`packages/daemon/src/model/professions.ts`)
- [ ] Padrão: sessão = `tech-lead`; `Explore` = `analyst`; `Plan` = `architect`; `general-purpose` = `developer`; nomes contendo `review|judge|gate|qa|test` = `qa`; `claude-code-guide|guide|docs` = `support`; fallback `developer`
- [ ] Override por `professions.json` (mapa exato + regras regex), carregado pelo daemon e passado ao reducer como config

### 3. LivenessClock (`packages/daemon/src/model/liveness.ts`)
- [ ] `tick(model, now, config): OfficeEvent[]` (`source:'clock'`): `actor.idle` após `idleAfterMs` (padrão 120000) sem atividade; `session.ended{expired}` após `expireAfterMs` (padrão 900000)
- [ ] Config com `initialWindowMs` (padrão 900000), usado pelo watcher (spec 004)

### 4. Testing
- [ ] `test/reducer.test.ts`: aplicar os eventos de cada fixture do spec 002 → modelo esperado (contagem de agentes, vínculos e status final)
- [ ] Determinismo: a mesma sequência aplicada duas vezes gera modelos deep-equal
- [ ] `test/liveness.test.ts`: relógio falso avança 2 min → idle; 15 min → expired e o projeto some
- [ ] `test/professions.test.ts`: tabela de agentType → profissão, mais o override

## Acceptance Criteria
### Must Have
- [ ] Reducer e liveness sem I/O e sem `Date.now()` interno
- [ ] Todos os testes passam

### Should Have
- [ ] `recentSteps` com texto legível (ex.: `Edit src/app.ts`, `Bash: pnpm test`)

## Testing Requirements
```bash
pnpm --filter @agents-office/daemon test reducer liveness professions
pnpm typecheck && pnpm lint
```

## Rollback Plan
Remover `packages/daemon/src/model/` e os testes correspondentes.
