---
title: Fim da sala "Unknown" e das sessões fantasma
number: 038
priority: high
tags: [bugfix, shared, daemon, web, testing]
dependencies: [032, 036]
related_prd: ../prds/sala-unknown-sessoes-fantasma.prd.md
status: done
created: 2026-10-11
---

# 038 - Fim da sala "Unknown" e das sessões fantasma

## Overview
Eventos de uma sessão desconhecida criam uma sessão e um projeto placeholder "unknown", que vira a sala "Unknown" e infla a contagem do HUD e do `/health`. Esta spec elimina os placeholders, faz sessões retomadas voltarem a emitir seu início e protege a contagem contra resíduos.

## Related PRD
- **Source**: [Fim da sala "Unknown" e das sessões fantasma](../prds/sala-unknown-sessoes-fantasma.prd.md)
- **Section Reference**: User Stories 1–13; Implementation Decisions

## Prerequisites
- [ ] Specs 032 e 036 concluídos
- [ ] Confirmar a causa do "4 sessões": listar `model.sessions` em `/health` ou no snapshot de `/stream` e ver se há entradas com `projectId` `unknown` ou `cwd` vazio
- [ ] Alterações não commitadas em `liveness.ts` e `hudLogic.ts` (spec 037) preservadas

## Dependencies
- 032 — contagem de atores vivos no HUD e `/health`
- 036 — liveness de sub-agentes

## Implementation Tasks
### 1. Redutor (`packages/shared/src/reducer.ts`)
- [ ] `ensureSession`, `ensureAgent` e `resolveActor`: sessão ausente deixa o modelo inalterado, sem criar sessão nem projeto `unknown`
- [ ] Manter a exceção: ator órfão com exatamente uma sessão existente é anexado a ela
- [ ] `agent.spawned` e `session.bound` para sessão inexistente: ignorar
- [ ] Remover `UNKNOWN_PROJECT_ID`, `UNKNOWN_SESSION_ID` e `adoptStrays` se ficarem sem uso
### 2. Normalizador (`packages/daemon/src/…/normalizer.ts`)
- [ ] Remover a marca `session.started:<id>` de `emittedKeys` ao emitir `session.ended`
- [ ] Cobrir a expiração por clock (`liveness.ts`): liberar a marca ou reemitir `session.started` quando chegar evento de sessão ausente do modelo
- [ ] Hook sem `cwd` não inicia sessão; o id da sessão nunca vira nome de projeto
### 3. Contagem (`packages/daemon/src/server/daemon.ts`, `packages/web/src/ui/hudLogic.ts`)
- [ ] `/health` e `hudCounts` ignoram sessões com projeto placeholder ou `cwd` vazio; preferir um helper compartilhado em `packages/shared/src/model.ts`
### 4. Testes
- [ ] Redutor: evento de ator, `agent.spawned` e `session.bound` para sessão desconhecida não criam sessão nem projeto; com uma única sessão, o ator é anexado
- [ ] Normalizador: sessão encerrada e retomada reemite `session.started`; hook sem `cwd` não inicia sessão
- [ ] Liveness: expira e é retomada gera nova sala
- [ ] `hudLogic.test.ts` e teste do `/health`: placeholders não contam
- [ ] E2E em `e2e/tests/office.spec.ts`: evento órfão não abre sala; HUD mostra a contagem real
### 5. Aprendizado
- [ ] Criar `.claude/learnings/unknown-room-placeholders.md`: por que o redutor não deve inventar sessões, e o papel das marcas de dedup do normalizador

## Acceptance Criteria
### Must Have
- [ ] Nenhuma sala "Unknown" ou toast "NOVA SALA unknown" aparece em nenhum cenário de evento órfão
- [ ] Sessão encerrada ou expirada que é retomada volta a ter sala real
- [ ] HUD e `/health` mostram só sessões e agentes reais
- [ ] Comportamento com uma única sessão (anexar atores órfãos) inalterado
- [ ] `pnpm typecheck`, `pnpm lint`, testes unitários e E2E verdes
### Should Have
- [ ] Nenhuma referência residual a "unknown" como id de projeto ou sessão

## Testing Requirements
```bash
pnpm typecheck && pnpm lint && pnpm vitest run
pnpm build && pnpm --filter @agents-office/e2e test
```
Manual: abrir 2 sessões do agent-office, encerrar uma, disparar `Stop` tardio e retomar; conferir que não há sala "Unknown" e que `curl /health` bate com o HUD.

## Rollback Plan
Reverter o commit: o redutor volta a criar placeholders e o normalizador a manter a marca de início, sem mudança de dados persistidos.
