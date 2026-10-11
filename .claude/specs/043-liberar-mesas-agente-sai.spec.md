---
title: Liberar mesas quando o agente sai
number: 043
priority: high
tags: [bugfix, web, layout, testing]
dependencies: [032, 035, 036, 038]
related_prd: ../prds/mesas-liberadas-agente-sai.prd.md
status: pending
created: 2026-10-11
---

# 043 - Liberar mesas quando o agente sai

## Overview
Agentes que terminam continuam no modelo com status `finished`, e o layout só ignora status `ended`, que nenhum agente recebe. A contagem de mesas nunca diminui. Esta spec faz o layout contar apenas agentes vivos ou ainda presentes na cena, e a sala encolher quando o personagem sai.

## Related PRD
- **Source**: [Mesas liberadas quando o agente sai](../prds/mesas-liberadas-agente-sai.prd.md)
- **Section Reference**: User Stories 1–12; Implementation Decisions

## Prerequisites
- [ ] Specs 032, 035, 036 e 038 concluídos
- [ ] Alterações não commitadas anteriores preservadas

## Dependencies
- 032 — `liveActors` e `isLive` no modelo compartilhado
- 035/036 — sub-agentes órfãos e reaper
- 038 — fim das sessões fantasma

## Implementation Tasks
### 1. Contagem de mesas (`packages/web/src/world/layoutInput.ts`)
- [ ] `build(model, retained, retainedAgents = new Set())`
- [ ] `agentCount` = agentes da sessão com `isLive` ou presentes em `retainedAgents`
- [ ] Sessões fantasma continuam usando a última contagem conhecida
### 2. Controlador (`packages/web/src/characters/characterController.ts`)
- [ ] Expor `agentsInUse(): ReadonlySet<string>` ao lado de `sessionsInUse()`
### 3. Cena (`packages/web/src/scenes/OfficeScene.ts`)
- [ ] `refreshLayout` passa `agentsInUse()` ao `build`
- [ ] Recalcular o layout quando um personagem termina de sair, não só quando o modelo muda
- [ ] Após `applyLayout`, `deskAssignments.reconcile` realoca quem perdeu a mesa (`characters/deskAssignment.ts`)
- [ ] Conferir que o agente realocado caminha até a nova mesa sem erro
### 4. Testes
- [ ] `LayoutInputBuilder`: finalizado não conta; finalizado retido conta; fantasma mantém contagem; contagem cai ao liberar o retido
- [ ] `deskAssignment.reconcile` com layout encolhendo
- [ ] E2E em `e2e/tests/office.spec.ts`: terminar sub-agentes, esperar saída e conferir menos mesas
### 5. Aprendizado
- [ ] Criar `.claude/learnings/desk-count-finished-agents.md`: por que o modelo mantém `finished` e a contagem de mesas deve usar `isLive` mais retidos

## Acceptance Criteria
### Must Have
- [ ] Mesa de agente finalizado some depois que o personagem sai da cena
- [ ] Animação de entrega e saída intacta
- [ ] Agente ativo nunca fica sem mesa quando o layout encolhe
- [ ] Sala volta a crescer com novos agentes
- [ ] `pnpm typecheck`, `pnpm lint`, testes unitários e E2E verdes
### Should Have
- [ ] Número de mesas coerente com a contagem de vivos do HUD

## Testing Requirements
```bash
pnpm typecheck && pnpm lint && pnpm vitest run
pnpm build && pnpm --filter @agents-office/e2e test
```
Manual: iniciar uma sessão com vários sub-agentes, deixá-los terminar e conferir que as mesas somem após a saída; iniciar novos e conferir que voltam.

## Rollback Plan
Reverter o commit: o layout volta a contar agentes finalizados. Sem mudança de dados persistidos.
