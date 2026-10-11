---
title: Limpar texturas de vinheta antigas
number: 046
priority: medium
tags: [bugfix, web, performance, testing]
dependencies: [044]
related_prd: ../prds/sem-flash-ao-redimensionar.prd.md
status: pending
created: 2026-10-11
---

# 046 - Limpar texturas de vinheta antigas

## Overview
`ensureVignette` cria uma textura `vignette:WxH` por tamanho e `OfficeScene.onResize` só troca para ela. Redimensionar muitas vezes acumula texturas na GPU.

## Related PRD
- **Source**: [Sem flash ao redimensionar](../prds/sem-flash-ao-redimensionar.prd.md)
- **Section Reference**: User Story 10; Implementation Decisions

## Prerequisites
- [ ] Spec 044 concluída

## Dependencies
- 044 — resize idempotente reduz a quantidade de trocas

## Implementation Tasks
### 1. Remoção (`packages/web/src/world/rugs.ts`, `packages/web/src/scenes/OfficeScene.ts`)
- [ ] Ao trocar para a nova vinheta, remover a textura anterior (`textures.remove`) depois de aplicar a nova
- [ ] Não remover a textura em uso
### 2. Testes
- [ ] Unitário (ou teste de cena existente): após N trocas de tamanho existe apenas uma textura `vignette:*`

## Acceptance Criteria
### Must Have
- [ ] Apenas uma textura de vinheta existe após vários resizes
- [ ] Vinheta continua visível e do tamanho correto
- [ ] `pnpm typecheck`, `pnpm lint` e testes verdes

## Testing Requirements
```bash
pnpm typecheck && pnpm lint && pnpm vitest run
```

## Rollback Plan
Reverter o commit: as texturas voltam a acumular, sem dados persistidos.
