---
title: Affordance de interatividade do quadro
number: 093
priority: medium
tags: [feature, web, ui, phaser, testing]
dependencies: [092]
related_prd: ../prds/quadro-na-sala-e-affordance.prd.md
status: done
created: 2026-10-12
---

# 093 - Affordance de interatividade do quadro

## Overview
Torna evidente que o quadro é clicável: selo flutuante, brilho pulsante discreto, hover mais claro e prompt de ação quando o avatar está perto.

## Related PRD
- **Source**: [Quadro dentro da sala e com affordance](../prds/quadro-na-sala-e-affordance.prd.md)
- **Section Reference**: User Stories 5-13, 16-19, 21, 22

## Prerequisites
- [ ] Ler `OfficeScene.updateBoardHover`, `setBoardHighlight`, o pulso do Tech Lead em `characterController.ts`, `hudLogic.ts` e `clickDecision.ts`

## Dependencies
- 092 (quadro dentro da sala)

## Implementation Tasks
### 1. Lógica pura
- [ ] Criar `world/boardAffordanceLogic.ts` (sem Phaser, `now` injetado): bob do selo, alpha do pulso, visibilidade (só desktop, sem overlay/ajuda/diálogo/visão geral)
### 2. Cena
- [ ] Desenhar selo (Graphics/texto) e brilho sobre o quadro, acima de `DEPTH.wallProps`, fora do `UiOverlay`; atualizar por frame em `update()`
- [ ] No hover: contorno sólido e cursor de mão, brilho substituído; `BOARD_LABEL` = "Quadro — clique para desenhar"
- [ ] Clique no selo equivale ao clique no quadro (incluir o selo na área do `boardAtPoint`)
### 3. HUD
- [ ] Prompt "Abrir o quadro" quando o avatar está no POI `whiteboard`; usar a tecla de ação para abrir via `BOARD_OPEN_EVENT` se já houver ação por POI, senão documentar em learning
### 4. Testes e docs
- [ ] `boardAffordanceLogic.test.ts`, `hudLogic.test.ts`, `boardProp.test.ts`
- [ ] DESIGN.md §6.6 e learning do quadro (pt-BR)
- [ ] Verificar por screenshots (Playwright) em vários zooms e projetos

## Acceptance Criteria
### Must Have
- [ ] No app desktop o quadro mostra selo e brilho; no navegador puro, nada
- [ ] Sinais somem com o overlay do quadro, ajuda, diálogo ou visão geral abertos
- [ ] Hover e prompt de proximidade indicam claramente a ação
### Should Have
- [ ] Sinal sutil, sem distrair da cena

## Testing Requirements
```bash
pnpm typecheck && pnpm lint && pnpm vitest run
```

## Rollback Plan
Reverter o commit desta spec.
