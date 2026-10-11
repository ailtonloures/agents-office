---
title: Dock do terminal à esquerda, à direita ou embaixo
number: 042
priority: medium
tags: [feature, web, ui, layout, terminal, testing]
dependencies: [040, 041]
related_prd: ../prds/terminal-por-clique-dock-botoes.prd.md
status: pending
created: 2026-10-11
---

# 042 - Dock do terminal à esquerda, à direita ou embaixo

## Overview
Adiciona a interface de posição do painel de terminais: seletor na barra de abas, layout em linha ou coluna, redimensionamento pela borda correta e faixa fina quando minimizado, dividindo a tela entre o escritório e os terminais.

## Related PRD
- **Source**: [Terminal por clique, dock e botões](../prds/terminal-por-clique-dock-botoes.prd.md)
- **Section Reference**: User Stories 13–21, 26; Implementation Decisions (layout, redimensionamento)

## Prerequisites
- [ ] Specs 040 e 041 concluídas

## Dependencies
- 040 — modelo com `dock`/`width`
- 041 — minimizar por clique (precisa funcionar nas laterais)

## Implementation Tasks
### 1. Layout
- [ ] `packages/web/index.html`: `body[data-dock]` alterna `flex-direction` (`column` embaixo; `row` nas laterais); `order` põe o painel antes de `#game` quando `left`
- [ ] `terminalPanel.ts` `render()`: aplicar altura (embaixo) ou largura (laterais) a partir de `panelOccupiedSize`; borda do painel (top/left/right) conforme o lado
- [ ] Minimizado: faixa fina de `TAB_BAR_HEIGHT` no lado escolhido com botão de expandir; abas verticais não são necessárias
### 2. Controles
- [ ] Seletor de dock (três botões pequenos) na barra de abas, chamando `setDock` e persistindo
- [ ] Redimensionamento: resizer na borda voltada ao escritório; usar `clientY` embaixo e `clientX` nas laterais; clamp com mínimo de 160px (altura) / 256px (largura) para o escritório; reclamp no `window resize`
- [ ] `fitActive()` após cada mudança de layout (já disparado por `emitLayout`)
- [ ] Indicador de foco (`#game::after`) e atalho Ctrl+` funcionam em qualquer lado
### 3. Phaser
- [ ] Confirmar que `ResizeObserver` em `#game` e `onLayout` recalculam zoom/resize sem mudanças em `scale.ts`
### 4. Testes
- [ ] Unitário: clamp e tamanho ocupado nas laterais (complementa spec 040)
- [ ] E2E: trocar dock redimensiona `#game`; Hooks, Sessões e zoom ficam dentro de `#game` em cada lado; reabrir o app mantém dock e tamanho

## Acceptance Criteria
### Must Have
- [ ] Painel encaixa nos três lados e redimensiona em cada um sem esconder o escritório
- [ ] Zoom do Phaser e xterm se ajustam; dock e tamanho persistem
- [ ] Botões do escritório nunca cobrem o painel
- [ ] `pnpm typecheck`, `pnpm lint`, testes unitários e E2E verdes
### Should Have
- [ ] Tooltips nos botões de dock
- [ ] Learnings em `.claude/learnings/terminal-layout.md`

## Testing Requirements
```bash
pnpm typecheck && pnpm lint && pnpm vitest run
pnpm build && pnpm --filter @agents-office/e2e test
```
Manual no app desktop: alternar entre os três lados, arrastar a borda, minimizar e expandir, reiniciar o app.

## Rollback Plan
Reverter o commit: o painel volta a ficar apenas embaixo; o armazenamento com `dock` extra é ignorado.
