---
title: Prop do quadro branco interativo (hover, cursor, rótulo, clique)
number: 076
priority: medium
tags: [feature, web, interaction, props]
dependencies: []
related_prd: ../prds/quadro-excalidraw.prd.md
status: pending
created: 2026-10-11
---

# 076 - Prop do quadro branco interativo (hover, cursor, rótulo, clique)

## Overview
Tornar o prop de parede `whiteboard` claramente interativo e garantir um por workspace.

## Related PRD
- **Source**: [Quadro branco interativo com Excalidraw](../prds/quadro-excalidraw.prd.md)

## Prerequisites
- [ ] Nenhum

## Dependencies
- Nenhuma

## Implementation Tasks
### 1. Cena
- [ ] `world/props.ts`/`roomDecor.ts`: um único quadro por sala/workspace
- [ ] Destaque no hover, cursor de mão, rótulo "Quadro — clique para abrir"
- [ ] Clique emite evento de abrir (usa `clickDecision.ts`)
### 2. Testes
- [ ] Testes de decisão de clique e de unicidade do prop

## Acceptance Criteria
- [ ] Quadro percebido como interativo
- [ ] Exatamente um quadro por workspace
- [ ] `pnpm typecheck && pnpm lint && pnpm vitest run` verdes

## Testing Requirements
```bash
pnpm typecheck && pnpm lint && pnpm vitest run
```

## Rollback Plan
Reverter o commit desta spec.
