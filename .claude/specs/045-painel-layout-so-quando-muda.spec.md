---
title: Painel emite layout só quando muda e foco sem re-render
number: 045
priority: high
tags: [bugfix, web, terminal, testing]
dependencies: [040, 041, 044]
related_prd: ../prds/sem-flash-ao-redimensionar.prd.md
status: pending
created: 2026-10-11
---

# 045 - Painel emite layout só quando muda e foco sem re-render

## Overview
`render()` do painel sempre chama `emitLayout()`, inclusive em `setActivity` (a cada evento `model`), e abrir pelo Tech Lead chama `focusSession` duas vezes. Isso gera resizes redundantes ao minimizar, abrir e arrastar.

## Related PRD
- **Source**: [Sem flash ao redimensionar](../prds/sem-flash-ao-redimensionar.prd.md)
- **Section Reference**: User Stories 2–7; Implementation Decisions

## Prerequisites
- [ ] Specs 040, 041 e 044 concluídos

## Dependencies
- 040 — modelo do painel (`panelOccupiedSize`)
- 041 — clique no Tech Lead abre o terminal
- 044 — resize idempotente

## Implementation Tasks
### 1. Chave de layout (`packages/web/src/ui/terminalPanel.ts`, `terminalTabs`)
- [ ] Função pura `layoutKey(model)` com ocupação, eixo, dock e minimizado
- [ ] `emitLayout` só dispara `onLayout` quando a chave mudou; `fitActive` continua ao mudar o tamanho do host
- [ ] `setActivity` que só altera título/estado não emite layout
### 2. Abrir pelo Tech Lead (`packages/web/src/main.ts`)
- [ ] Remover o segundo `panel.focusSession` em rAF; garantir o foco do xterm sem `render()` (ex.: método `focusTerminal()` no painel)
- [ ] Manter o teclado no terminal após a abertura
### 3. Testes
- [ ] Unitário: `layoutKey` igual para mudanças de atividade, diferente para dock, tamanho e minimizado
- [ ] E2E: minimizar e abrir geram no máximo 1 resize real cada; o terminal tem o foco do teclado

## Acceptance Criteria
### Must Have
- [ ] Sem flash ao minimizar pelo vazio e ao abrir pelo Tech Lead
- [ ] Mudança de atividade de aba não redimensiona o canvas
- [ ] Teclado vai para o terminal ao abrir
- [ ] `pnpm typecheck`, `pnpm lint`, testes unitários e E2E verdes
### Should Have
- [ ] Arrastar a borda do painel gera no máximo um resize por frame

## Testing Requirements
```bash
pnpm typecheck && pnpm lint && pnpm vitest run
pnpm build && pnpm --filter @agents-office/e2e test
```
Manual: clicar no Tech Lead, no vazio e arrastar a borda, sem flash.

## Rollback Plan
Reverter o commit: o painel volta a emitir layout a cada render.
