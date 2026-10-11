---
title: Barra de abas sem scrollbar nativa
number: 049
priority: high
tags: [bugfix, web, terminal, ui, testing]
dependencies: [048]
related_prd: ../prds/terminal-sem-corte-scrollbars.prd.md
status: done
created: 2026-10-11
---

# 049 - Barra de abas sem scrollbar nativa

## Overview
A scrollbar horizontal de `.ao-term-tabs` ocupa altura dentro da barra fixa de 28px (`overflow:hidden`) e aperta as abas.

## Related PRD
- **Source**: [Terminal sem corte e scrollbars](../prds/terminal-sem-corte-scrollbars.prd.md)
- **Section Reference**: User Stories 12–16

## Prerequisites
- [ ] Spec 048 concluída

## Dependencies
- 048 — o estilo global não deve reaparecer nas abas

## Implementation Tasks
### 1. Barra (`packages/web/src/ui/terminalPanel.ts`)
- [ ] `.ao-term-tabs`: `scrollbar-width:none` e `::-webkit-scrollbar{display:none}`
- [ ] `wheel` em `tabsEl`: `deltaY` vira `scrollLeft` (sem `preventDefault` quando não há overflow)
- [ ] Após `render()`, `scrollIntoView({inline:'nearest',block:'nearest'})` na aba ativa
- [ ] `.ao-term-tab`, `.ao-term-focus`, `.ao-term-docks` e toggle com `flex:none`; só `.ao-term-tabs` encolhe
### 2. Testes
- [ ] Verificação e2e (`/qa`): muitas abas, altura da barra constante, aba ativa visível, botões intactos

## Acceptance Criteria
### Must Have
- [ ] Nenhuma barra horizontal visível na barra de abas
- [ ] Rolagem por roda funciona e a aba ativa fica visível
- [ ] `pnpm typecheck`, `pnpm lint` e testes verdes

## Testing Requirements
```bash
pnpm typecheck && pnpm lint && pnpm vitest run
```

## Rollback Plan
Reverter o commit; volta à scrollbar nativa.
