---
title: Banner de atualização na web
number: 058
priority: high
tags: [feature, web, ui, updater]
dependencies: [057-ponte-preload-updater.spec.md]
related_prd: ../prds/auto-update-releases.prd.md
status: done
created: 2026-10-11
---

# 058 - Banner de atualização na web

## Overview
Banner PT-BR que mostra versão, progresso e ações de atualização.

## Related PRD
- **Source**: [Auto-update e releases](../prds/auto-update-releases.prd.md)

## Dependencies
- [057-ponte-preload-updater.spec.md]

## Implementation Tasks
### 1. UI
- [ ] `packages/web/src/ui/updateLogic.ts` (estado → texto/visibilidade/"Depois") e `updateBanner.ts` (modelo `settingsPanel.ts`, `BUTTON_CSS`, `data-testid`)
- [ ] Textos: "Nova versão X disponível — baixando…", "Reiniciar e atualizar", "Depois"
- [ ] Montar em `main.ts` só se `bridge.updater` existir; liberar captura de teclado do Phaser como no settings panel
### 2. Testes
- [ ] Teste unitário de `updateLogic`
- [ ] E2E Playwright com ponte simulada (available, ready, Depois)

## Acceptance Criteria
- [ ] Sem ponte, nada é exibido; com ponte, banner segue os estados

## Testing Requirements
```bash
pnpm typecheck && pnpm lint && pnpm vitest run
```

## Rollback Plan
Reverter o commit desta spec.
