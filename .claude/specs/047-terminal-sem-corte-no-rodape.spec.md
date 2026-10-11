---
title: Terminal sem corte no rodapé
number: 047
priority: high
tags: [bugfix, web, terminal, layout, testing]
dependencies: []
related_prd: ../prds/terminal-sem-corte-scrollbars.prd.md
status: done
created: 2026-10-11
---

# 047 - Terminal sem corte no rodapé

## Overview
O final do terminal aparece cortado ao abrir. O `FitAddon` só reajusta em `window.resize` e chamadas pontuais, e o painel pode ultrapassar a janela em alturas baixas.

## Related PRD
- **Source**: [Terminal sem corte e scrollbars](../prds/terminal-sem-corte-scrollbars.prd.md)
- **Section Reference**: User Stories 1–7, 18; Implementation Decisions

## Prerequisites
- [ ] Reproduzir o corte no navegador (Playwright) e registrar qual causa se confirma

## Dependencies
- Nenhuma

## Implementation Tasks
### 1. Reajuste (`packages/web/src/ui/terminalPanel.ts`)
- [ ] `ResizeObserver` no `.ao-term-body` chamando `fitActive()` agrupado por `requestAnimationFrame`; desconectar no teardown
- [ ] `fitActive()` em `requestAnimationFrame` após abrir, expandir, trocar de dock e aplicar layout
- [ ] `#ao-terminal` com `overflow:hidden`, `max-height:100%` (dock baixo) e `max-width:100%` (docks laterais)
- [ ] `.ao-term` com `padding:4px 0 4px 6px`
### 2. Limites (`packages/web/src/ui/terminalTabs.ts`)
- [ ] `clampHeight`/`clampWidth`: o máximo respeita `MIN_OFFICE_*` e nunca passa do tamanho da janela, mesmo que fique abaixo de `MIN_PANEL_*`
### 3. Testes
- [ ] Unitários de `clampHeight`/`clampWidth` (janela baixa, estreita, normal)
- [ ] Atualizar testes existentes afetados

## Acceptance Criteria
### Must Have
- [ ] Última linha e borda inferior visíveis nos três docks
- [ ] Painel nunca ultrapassa a janela
- [ ] `pnpm typecheck`, `pnpm lint` e testes verdes

## Testing Requirements
```bash
pnpm typecheck && pnpm lint && pnpm vitest run
```

## Rollback Plan
Reverter o commit; sem dados persistidos além da altura salva, que continua sendo reclampada.
