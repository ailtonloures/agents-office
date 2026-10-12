---
title: Quadro Excalidraw dentro da sala do projeto
number: 092
priority: medium
tags: [feature, web, world, layout, testing]
dependencies: []
related_prd: ../prds/quadro-na-sala-e-affordance.prd.md
status: done
created: 2026-10-12
---

# 092 - Quadro Excalidraw dentro da sala do projeto

## Overview
Move o prop `whiteboard` e seu ponto de interesse da parede do corredor para a parede de topo da própria sala, mantendo um quadro por workspace.

## Related PRD
- **Source**: [Quadro dentro da sala e com affordance](../prds/quadro-na-sala-e-affordance.prd.md)
- **Section Reference**: User Stories 1-4, 14, 15, 20

## Prerequisites
- [ ] Ler `.claude/learnings/quadro-excalidraw-overlay.md` e a spec 076
- [ ] Ler `packages/web/src/world/roomLayout.ts` (`buildRoom`, `layoutBuilding`) e `boardProp.ts`

## Dependencies
- Nenhuma

## Implementation Tasks
### 1. Layout
- [ ] No chunk `entrance` de `buildRoom`, trocar o prop `art-wide` em (10, 1) por `whiteboard`
- [ ] Mover o POI `whiteboard` para o tile de piso abaixo do quadro, dentro da sala (mesmo critério do POI `window`)
- [ ] Remover o prop e o POI do quadro do loop do corredor em `layoutBuilding`; manter janelas, relógio/pôster e plantas
- [ ] Confirmar que o tile do POI está livre e alcançável a partir do spawn
### 2. Quadro
- [ ] Garantir que `boardSpots`/`boardAtPoint` funcionam com a nova linha (sem depender do corredor)
### 3. Testes e docs
- [ ] Ajustar `roomLayout.test.ts` e `boardProp.test.ts`: quadro e POI dentro de `roomBounds`, 1 por workspace, POI alcançável, sem sobreposição
- [ ] DESIGN.md §2.5 e learning do quadro (pt-BR)

## Acceptance Criteria
### Must Have
- [ ] Cada sala exibe exatamente um quadro na sua parede de topo, sem sobrepor porta, placa ou janelas
- [ ] O clique no quadro continua abrindo o Excalidraw do projeto certo
- [ ] Agentes desenham a partir de um ponto dentro da sala
### Should Have
- [ ] Nenhuma alteração visível no corredor além da ausência do quadro

## Testing Requirements
```bash
pnpm typecheck && pnpm lint && pnpm vitest run
```

## Rollback Plan
Reverter o commit desta spec.
