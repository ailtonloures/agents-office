---
title: HUD estático durante o zoom do escritório
number: 037
priority: high
tags: [bugfix, web, camera, ui, testing]
dependencies: [033, 034]
related_prd: ../prds/hud-estatico-zoom.prd.md
status: pending
created: 2026-10-11
---

# 037 - HUD estático durante o zoom do escritório

## Overview
O HUD, o painel de dicas, o diálogo, o painel de ajuda, o aviso e a vinheta usam `setScrollFactor(0)`, mas ainda são escalados pelo zoom da câmera principal. Esta spec move todos para uma camada de UI desenhada por uma segunda câmera em zoom 1, de modo que só o escritório se mova.

## Related PRD
- **Source**: [HUD estático durante o zoom do escritório](../prds/hud-estatico-zoom.prd.md)
- **Section Reference**: User Stories 1–22; Implementation Decisions

## Prerequisites
- [ ] Specs 033 e 034 concluídos

## Dependencies
- 033 — zoom da câmera e eventos
- 034 — botões de zoom

## Implementation Tasks
### 1. Câmera e camada de UI (`packages/web/src/scenes/OfficeScene.ts`)
- [ ] Criar `uiLayer = this.add.layer()` e `uiCamera = this.cameras.add(0, 0, width, height)` (zoom 1, sem follow nem bounds)
- [ ] `cameras.main.ignore(uiLayer)`
- [ ] A `uiCamera` ignora a display list existente que não esteja na camada e, via `Phaser.Scenes.Events.ADDED_TO_SCENE`, todo objeto novo fora da camada; remover o listener no `shutdown`
- [ ] Em `onResize`, `uiCamera.setSize(width, height)`
- [ ] Vinheta e aviso (toast) entram na camada
### 2. Módulos de UI (`packages/web/src/ui/`)
- [ ] `hud.ts` / `keyHints.ts`: adicionar painel, ponto, textos, painel de atalhos e `hints.container` à camada
- [ ] `promptBar.ts`, `helpPanel.ts`, `dialogBox.ts`: idem
- [ ] Passar a camada (ou função de registro) pelos construtores; manter profundidades atuais
- [ ] Verificar se algum objeto de UI usa `setInteractive`; se sim, tratar o hit-test pela câmera de UI
### 3. Visão geral
- [ ] Manter o comportamento atual de `toggleOverview` (HUD e prompt ocultos)
### 4. Testes
- [ ] E2E em `e2e/tests/office.spec.ts`: em zoom 0,5, 1 e 3, tamanho e posição do HUD, da barra de dicas e do diálogo são idênticos; o zoom do mundo muda
- [ ] Expor em `debugState.ts` o necessário (ex.: limites do HUD) e tipar em `e2e/support/office.ts`
- [ ] Unitário para qualquer lógica pura nova
### 5. Aprendizado
- [ ] Atualizar `.claude/learnings/office-zoom.md`: scroll factor 0 não impede o zoom; UI passa por câmera de UI em zoom 1

## Acceptance Criteria
### Must Have
- [ ] No zoom in e no zoom out, HUD, atalhos, painel de dicas, diálogo, ajuda e aviso mantêm tamanho e posição
- [ ] Só o escritório (mundo) é ampliado e reduzido
- [ ] A vinheta cobre a tela inteira em qualquer zoom
- [ ] Redimensionar a janela reposiciona a UI corretamente
- [ ] Ctrl + roda, botões, persistência e `M` seguem funcionando; avatar e cliques sem regressão
- [ ] `pnpm typecheck`, `pnpm lint`, testes unitários e E2E verdes
### Should Have
- [ ] Texto bitmap nítido e sem mundo desenhado duas vezes (conferir por screenshot)

## Testing Requirements
```bash
pnpm typecheck && pnpm lint && pnpm vitest run
pnpm build && pnpm --filter @agents-office/e2e test
```
Manual com `?demo`: Ctrl + roda, botões, `M`, redimensionar, abrir diálogo e ajuda com zoom 3.

## Rollback Plan
Reverter o commit: remove a câmera e a camada de UI; os módulos de UI voltam a usar `setScrollFactor(0)` (comportamento anterior, com o HUD escalando no zoom).
