---
title: Scrollbars finos globais
number: 048
priority: medium
tags: [feature, web, ui, testing]
dependencies: []
related_prd: ../prds/terminal-sem-corte-scrollbars.prd.md
status: done
created: 2026-10-11
---

# 048 - Scrollbars finos globais

## Overview
Não há estilo de scrollbar no projeto; tudo usa o padrão do navegador.

## Related PRD
- **Source**: [Terminal sem corte e scrollbars](../prds/terminal-sem-corte-scrollbars.prd.md)
- **Section Reference**: User Stories 8–11, 17

## Prerequisites
- Nenhum

## Dependencies
- Nenhuma

## Implementation Tasks
### 1. Módulo (`packages/web/src/ui/scrollbars.ts`, novo)
- [ ] Exportar `SCROLLBAR_CSS`: `scrollbar-width:thin`, `scrollbar-color`, fallback `::-webkit-scrollbar` (8px, thumb `#2a2d44`, hover `#3a3f5c`, ativo `#f0c040`, trilho transparente, `::-webkit-scrollbar-corner`)
- [ ] Injetar uma vez no bootstrap (ou em `index.html`) com seletor `*`
### 2. Cobertura
- [ ] Conferir `.xterm-viewport`, modal de `settingsPanel.ts`, `.ao-hooks-diff` e `.ao-picker-list`
### 3. Testes
- [ ] Unitário: o CSS contém as regras moderna e WebKit e as cores da paleta

## Acceptance Criteria
### Must Have
- [ ] Todas as scrollbars finas e na paleta
- [ ] Sem alterar layout dos painéis
- [ ] `pnpm typecheck`, `pnpm lint` e testes verdes

## Testing Requirements
```bash
pnpm typecheck && pnpm lint && pnpm vitest run
```

## Rollback Plan
Remover o módulo e a injeção; volta ao padrão do navegador.
