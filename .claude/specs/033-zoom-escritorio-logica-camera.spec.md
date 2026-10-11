---
title: Zoom do escritório — lógica, câmera e Ctrl + roda
number: 033
priority: medium
tags: [feature, web, camera, testing]
dependencies: []
related_prd: ../prds/zoom-escritorio.prd.md
status: done
created: 2026-10-11
---

# 033 - Zoom do escritório: lógica, câmera e Ctrl + roda

## Overview
Cria o módulo puro de zoom e aplica o nível escolhido na câmera da `OfficeScene`, controlado por Ctrl + roda. Os botões DOM ficam no spec 034.

## Related PRD
- **Source**: [Zoom do escritório](../prds/zoom-escritorio.prd.md)
- **Section Reference**: User Stories 1, 2, 6, 7, 10–13, 15, 16, 18, 19, 23–25; Implementation Decisions

## Prerequisites
- [ ] Nenhum

## Dependencies
- Nenhuma

## Implementation Tasks
### 1. Lógica pura (`packages/web/src/zoom.ts`)
- [ ] Constantes `ZOOM_MIN = 0.5`, `ZOOM_MAX = 3`, `ZOOM_STEP = 0.25`, `ZOOM_DEFAULT = 1`
- [ ] `clampZoom`, `stepZoom(z, dir)` (arredonda ao passo e faz clamp), `wheelDirection(deltaY)` (deltaY < 0 aproxima)
- [ ] `readStoredZoom()` / `writeStoredZoom()` com chave `agents-office.zoom`, em try/catch (padrão de `terminalPanel.ts`); valor ausente, não numérico ou fora do intervalo → `ZOOM_DEFAULT`
- [ ] Testes em `packages/web/test/zoom.test.ts`: limites, passos, arredondamento, direção, persistência, valor inválido, storage indisponível
### 2. Câmera (`packages/web/src/scenes/OfficeScene.ts`)
- [ ] Campo `userZoom` inicializado por `readStoredZoom()`; `applyZoom(z)` aplica `camera.setZoom`, grava e atualiza `window.__office`
- [ ] Em `setupInput`: listener `wheel` do Phaser; só age se `ev.ctrlKey` e fora da visão geral; chama `ev.preventDefault()` e `applyZoom(stepZoom(...))`
- [ ] Expor `zoomBy(dir)` e escutar um evento do jogo (ex.: `zoom-step`) que o spec 034 usará
- [ ] `toggleOverview`: ao sair, restaurar `camera.setZoom(userZoom)` (hoje usa 1); ignorar zoom na visão geral
- [ ] Manter `roundPixels`/`pixelArt`; conferir nitidez nos passos fracionários
### 3. Cancelar zoom nativo (`packages/web/src/main.ts`)
- [ ] Listener `wheel` não passivo em `game.canvas` que faz `preventDefault()` quando `ctrlKey`; não afetar o painel de terminal
### 4. Debug (`packages/web/src/debug/debugState.ts`, `e2e/support/office.ts`)
- [ ] Campo `zoom` no estado de depuração e na tipagem do E2E

## Acceptance Criteria
- [ ] Ctrl + roda para cima/baixo altera o zoom em passos de 0,25 entre 0,5 e 3
- [ ] Roda sem Ctrl não altera o zoom; Ctrl + roda não dá zoom na página
- [ ] HUD, diálogos e prompt mantêm o tamanho
- [ ] Zoom persiste após recarregar; valor inválido cai em 1
- [ ] Sair da visão geral (`M`) volta ao zoom escolhido

## Verification
`pnpm -r test`, `pnpm typecheck`, `pnpm biome check`. Manual com `?demo`: Ctrl + roda, limites, recarregar, `M`. Registrar aprendizado em `.claude/learnings/office-zoom.md`.
