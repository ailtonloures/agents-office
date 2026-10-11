---
title: Resize idempotente, coalescido e com render síncrono
number: 044
priority: high
tags: [bugfix, web, performance, testing]
dependencies: [033, 037, 040]
related_prd: ../prds/sem-flash-ao-redimensionar.prd.md
status: pending
created: 2026-10-11
---

# 044 - Resize idempotente, coalescido e com render síncrono

## Overview
`resize()` limpa o canvas (`canvas.width/height`) e roda fora do passo de render do Phaser, então o navegador pinta um frame vazio. Esta spec torna o resize idempotente, coalescido por frame e seguido de um render síncrono.

## Related PRD
- **Source**: [Sem flash ao redimensionar](../prds/sem-flash-ao-redimensionar.prd.md)
- **Section Reference**: User Stories 1–3, 8, 9, 11–13; Implementation Decisions

## Prerequisites
- [ ] Specs 033, 037 e 040 concluídos

## Dependencies
- 033 — zoom e câmera do escritório
- 037 — câmera de UI estática
- 040 — painel do terminal em dock

## Implementation Tasks
### 1. Guarda de resize (`packages/web/src/main.ts`, lógica pura em `packages/web/src/scale.ts`)
- [ ] Guardar o último `{zoom, width, height}`; retornar se igual
- [ ] Extrair a comparação para função pura testável
### 2. Render síncrono
- [ ] Após `setZoom` + `scale.resize`, chamar `game.step(performance.now(), game.loop.delta)` (conferir a assinatura em phaser@3.90.0)
- [ ] Confirmar que câmeras e `OfficeScene.onResize` já rodaram (evento `resize`) antes do step
### 3. Coalescência
- [ ] Agendador único (um por frame) para evento `window` resize, `ResizeObserver` e `onLayout`
### 4. Debug
- [ ] Contador de resizes reais em `debug/debugState`
### 5. Testes
- [ ] Unitário: guarda ignora valores iguais, aceita mudança de zoom ou tamanho
- [ ] E2E (`e2e/tests/`): redimensionar a janela gera no máximo 1 resize real por mudança
### 6. Aprendizado
- [ ] Criar `.claude/learnings/canvas-resize-flash.md`: redimensionar limpa o canvas; por que render síncrono e guarda

## Acceptance Criteria
### Must Have
- [ ] Sem frame vazio ao redimensionar a janela
- [ ] Chamadas repetidas com os mesmos valores não tocam o canvas
- [ ] HUD, diálogos e câmera corretos após o resize
- [ ] `pnpm typecheck`, `pnpm lint`, testes unitários e E2E verdes
### Should Have
- [ ] No máximo um resize real por frame

## Testing Requirements
```bash
pnpm typecheck && pnpm lint && pnpm vitest run
pnpm build && pnpm --filter @agents-office/e2e test
```
Manual: redimensionar a janela do app desktop em várias velocidades e observar que não há flash.

## Rollback Plan
Reverter o commit: volta o resize anterior, sem dados persistidos.
