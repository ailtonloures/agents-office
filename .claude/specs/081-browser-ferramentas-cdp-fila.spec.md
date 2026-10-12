---
title: Ferramentas browser_* via CDP e fila de ações
number: 081
priority: high
tags: [feature, desktop, mcp, browser, testing]
dependencies: [080-browser-host-aba-dock.spec.md]
related_prd: ../prds/navegador-embutido.prd.md
status: pending
created: 2026-10-11
---

# 081 - Ferramentas browser_* via CDP e fila de ações

## Overview
Ferramentas `navigate`, `click`, `type`, `press_key`, `eval`, `wait_for` via `webContents.debugger` e fila serializada por workspace.

## Related PRD
- **Source**: [Navegador embutido controlado por agentes](../prds/navegador-embutido.prd.md)

## Prerequisites
- [ ] `080-browser-host-aba-dock.spec.md` concluída

## Dependencies
- [080-browser-host-aba-dock.spec.md]

## Implementation Tasks
### 1. CDP
- [ ] `src/main/browserDriver.ts` sobre `webContents.debugger`
- [ ] Ferramentas no Agent Bus com erros estruturados
### 2. Fila
- [ ] Fila por workspace com agente autor; indicador de quem usa o navegador
### 3. Testes
- [ ] Driver CDP falso; ordem e autor na fila

## Acceptance Criteria
- [ ] Ações de dois agentes nunca se intercalam
- [ ] `pnpm typecheck && pnpm lint && pnpm vitest run` verdes

## Testing Requirements
```bash
pnpm typecheck && pnpm lint && pnpm vitest run
```

## Rollback Plan
Reverter o commit desta spec.
