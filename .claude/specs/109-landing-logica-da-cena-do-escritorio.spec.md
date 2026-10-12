---
title: Landing - lógica pura da cena do escritório
number: 109
priority: high
tags: [feature, landing, logic, testing]
dependencies: [106-landing-scaffold-do-pacote.spec.md]
related_prd: ../prds/landing-page-comercial.prd.md
status: pending
created: 2026-10-12
---

# 109 - Landing - lógica pura da cena do escritório

## Overview
Módulo puro (`officeLogic.ts`) que decide, para um instante dado, onde cada agente está e o que faz na cena do hero. Sem canvas, DOM nem leitura de relógio, para ser testável sem navegador.

## Related PRD
- **Source**: [Landing page comercial](../prds/landing-page-comercial.prd.md)
- **Section Reference**: User Stories 2, 42; Implementation Decisions (lógica da cena); Testing Decisions (seam 1)

## Prerequisites
- [ ] Ler `packages/web/src/ui/hudLogic.ts` e `castLogic.ts` (padrão de lógica pura com `now` injetado)
- [ ] Ler `DESIGN.md` seção 3 (estados e poses dos personagens)

## Dependencies
- `106-landing-scaffold-do-pacote.spec.md` - pacote

## Implementation Tasks
### 1. Modelo (`src/pixel/officeLogic.ts`)
- [ ] Tipos: `AgentRole`, `AgentState` (`entering | working | reporting | leaving`), `ActivityKind` (typing, reading, terminal, thinking, waiting), `SceneAgent`
- [ ] Roteiro determinístico (`SCRIPT`) com Tech Lead fixo na mesa principal e subagentes com entrada, permanência e saída em ciclo
- [ ] `sceneAt(nowMs: number): SceneSnapshot` pura, com posição em grade (tile 16px), pose, atividade e cor do anel de status
- [ ] Ciclo repetível: `nowMs` módulo o tamanho do ciclo, sem estado oculto
- [ ] Trajetórias em grade entre porta e mesa, sem teletransporte
### 2. Testes (`test/officeLogic.test.ts`)
- [ ] Ordem de entrada e saída, posições dentro dos limites, Tech Lead sempre sentado
- [ ] Mesmo `nowMs` produz o mesmo resultado; ciclo se repete
- [ ] Estados cobrem todas as atividades e todos os papéis do roteiro

## Acceptance Criteria
### Must Have
- [ ] Módulo não importa React, DOM nem `Date`/`performance`
- [ ] Testes passam
### Should Have
- [ ] Roteiro configurável por constantes nomeadas

## Testing Requirements
```bash
pnpm vitest run packages/landing/test/officeLogic.test.ts
pnpm typecheck && pnpm lint
```

## Rollback Plan
Reverter `src/pixel/officeLogic.ts` e seu teste.
