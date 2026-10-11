---
title: Botões Hooks e Sessões dentro da área do escritório
number: 039
priority: high
tags: [bugfix, web, ui, layout]
dependencies: [037]
related_prd: ../prds/terminal-por-clique-dock-botoes.prd.md
status: pending
created: 2026-10-11
---

# 039 - Botões Hooks e Sessões dentro da área do escritório

## Overview
Os botões Hooks e Sessões usam `position:fixed` no viewport e por isso ficam por cima do terminal docado. Esta spec os move para dentro de `#game` com posicionamento absoluto, como os botões de zoom, para que acompanhem a área do escritório.

## Related PRD
- **Source**: [Terminal por clique, dock e botões](../prds/terminal-por-clique-dock-botoes.prd.md)
- **Section Reference**: User Stories 22–25; Implementation Decisions (botões no contêiner do escritório)

## Prerequisites
- [ ] Spec 037 concluída (HUD estático / UI camera)
- [ ] Alterações não commitadas em `packages/shared/src/reducer.ts` (spec 038) preservadas

## Dependencies
- 037 — layout atual de `#game` e controles

## Implementation Tasks
### 1. Botões
- [ ] `packages/web/src/ui/settingsPanel.ts`: `mountSettingsPanel` recebe `gameParent`; botão `.ao-hooks-btn` e banner de instalação passam de `position:fixed` para `position:absolute` e são anexados a `gameParent`
- [ ] `packages/web/src/ui/projectPickerPanel.ts`: `mountProjectPicker` recebe `gameParent`; `.ao-picker-btn` passa a `position:absolute` e é anexado a `gameParent`
- [ ] Manter offsets (`left:8px`/`72px`, `bottom:8px`; banner `bottom:44px`) e `z-index` abaixo dos modais
- [ ] `packages/web/src/main.ts`: passar `gameParent` às duas funções (padrão de `mountZoomControls`)
- [ ] Verificar `ui/buttonStyles.ts` e os modais (que continuam em `document.body`, centralizados no viewport)
### 2. Testes
- [ ] E2E em `e2e/tests/office.spec.ts`: Hooks e Sessões são descendentes de `#game` e seus retângulos ficam dentro do de `#game`
- [ ] Teste manual com o terminal aberto embaixo: botões ficam acima do terminal

## Acceptance Criteria
### Must Have
- [ ] Com o terminal aberto, nenhum botão cobre o terminal
- [ ] Botões sobem e descem com o redimensionamento do painel
- [ ] Modais de Hooks e Sessões continuam funcionando
- [ ] `pnpm typecheck`, `pnpm lint`, testes unitários e E2E verdes
### Should Have
- [ ] Nenhum `position:fixed` restante nos botões de canto

## Testing Requirements
```bash
pnpm typecheck && pnpm lint && pnpm vitest run
pnpm build && pnpm --filter @agents-office/e2e test
```

## Rollback Plan
Reverter o commit: os botões voltam a `position:fixed` no `document.body`.
