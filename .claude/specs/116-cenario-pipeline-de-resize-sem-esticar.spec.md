---
title: Cenário - pipeline de resize sem esticar ao abrir o terminal
number: 116
priority: high
tags: [bugfix, web, phaser, layout, testing]
dependencies: []
related_prd: ../prds/cenario-responsivo-terminal-ultrawide.prd.md
status: pending
created: 2026-10-18
---

# 116 - Cenário - pipeline de resize sem esticar ao abrir o terminal

## Overview
Ao abrir o terminal acoplado o cenário aparece esticado até o terminal ser movido. Esta spec reproduz o defeito, confirma a causa e corrige o pipeline de resize para que o canvas, o zoom e a câmera fiquem corretos no mesmo quadro em que o layout do DOM muda.

## Related PRD
- **Source**: [Cenário responsivo](../prds/cenario-responsivo-terminal-ultrawide.prd.md)
- **Section Reference**: User Stories 1 a 7, 20 a 24, 29; Implementation Decisions (causa, pipeline de resize, módulo de escala, cena, observadores)

## Prerequisites
- [ ] `pnpm typecheck && pnpm lint && pnpm vitest run` verdes antes de começar
- [ ] App rodando para o spike (skill `run`) e Playwright MCP disponível

## Dependencies
- Nenhuma. As specs 117 e 118 dependem desta.

## Implementation Tasks
### 0. Spike de reprodução (antes de qualquer código)
- [ ] Abrir o terminal em 1920x1080 e 3440x1440 e capturar tela imediatamente e 1 s depois
- [ ] Ler `debug.resizes`, o `width`/`height`/`style` do canvas e `clientWidth`/`clientHeight` de `#game` logo após abrir
- [ ] Registrar a causa confirmada em `.claude/learnings/canvas-resize-flash.md` (atualizar o existente, pt-BR). Candidatas: quadro entre o DOM e o canvas; `setZoom` emitindo `RESIZE` com tamanho antigo; `canvas.style` não reescrito com zoom 1; limites da câmera por `displayWidth`

### 1. Testes primeiro (Red)
- [ ] `packages/web/test/scale.test.ts`: `canvasCssSize(viewport)` devolve `width * zoom` x `height * zoom` (1280x720, 1920x1080, 3440x1440, HiDPI 1.5 e 2)
- [ ] `packages/web/test/scale.test.ts`: caso "terminal abre": `viewportForArea` com a área menor e a janela igual mantém `zoom` e `renderScale` e reduz `width`/`height`; fechar volta ao valor original
- [ ] Rodar `pnpm vitest run packages/web/test/scale.test.ts` e ver falhar pelo motivo certo

### 2. Módulo de escala (Green)
- [ ] `packages/web/src/scale.ts`: adicionar `canvasCssSize(viewport)` (puro, sem Phaser)

### 3. Pipeline em `main.ts`
- [ ] `applyResize`: ordem tamanho do jogo, zoom, depois `canvas.style.width/height` a partir de `canvasCssSize`; sem `RESIZE` intermediário com tamanho antigo (confirmado pelo spike)
- [ ] Manter `viewportChanged` (nunca redimensionar com valores iguais) e o `game.step()` síncrono após o resize
- [ ] Aplicar o resize pedido pelo painel do terminal (`onLayout`) no mesmo quadro, ainda coalescido a um por quadro
- [ ] Remover o `ResizeObserver` duplicado do contêiner `#game`

### 4. Cena `OfficeScene.ts`
- [ ] `onResize`: recalcular zoom e limites da câmera depois que a câmera já tem o tamanho novo, e só então recentralizar no avatar
- [ ] `setCameraBounds`: usar o tamanho lógico da visão (`logicalSizeOf`) e o zoom, não `camera.displayWidth`

### 5. Refactor
- [ ] Remover código morto e manter Biome limpo (`pnpm format`)

## Acceptance Criteria
### Must Have
- [ ] Abrir, fechar, recolher, mudar de doca e arrastar o terminal nunca mostram o cenário esticado, sem precisar mover o terminal
- [ ] O zoom não muda quando o terminal abre ou fecha
- [ ] Testes novos vistos falhando antes e passando depois; nenhum teste enfraquecido
- [ ] Causa confirmada registrada no learning
### Should Have
- [ ] Nenhum piscar visível no resize (regra do learning `canvas-resize-flash.md`)
- [ ] Comportamento igual em dpr 1, 1.5 e 2

## Testing Requirements
```bash
pnpm vitest run packages/web/test/scale.test.ts
pnpm typecheck && pnpm lint && pnpm vitest run
```
Verificação manual com Playwright MCP em 1280x720, 1920x1080 e 3440x1440, nas três docas. Essa parte depende de Phaser/DOM e não é coberta por teste unitário.

## Rollback Plan
Reverter o commit desta spec (`git revert`); `scale.ts` e `main.ts` voltam ao comportamento do commit 52e9214.
