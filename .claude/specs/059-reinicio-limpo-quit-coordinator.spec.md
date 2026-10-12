---
title: Reinício limpo integrado ao QuitCoordinator
number: 059
priority: high
tags: [feature, desktop, updater, quit]
dependencies: [056-servico-update-main-ipc.spec.md]
related_prd: ../prds/auto-update-releases.prd.md
status: done
created: 2026-10-11
---

# 059 - Reinício limpo integrado ao QuitCoordinator

## Overview
Instalar a atualização passa pelo fluxo de saída existente e termina com quitAndInstall, sem loop de before-quit.

## Related PRD
- **Source**: [Auto-update e releases](../prds/auto-update-releases.prd.md)

## Dependencies
- [056-servico-update-main-ipc.spec.md]

## Implementation Tasks
### 1. Desktop
- [ ] `install()` → `quit.request('interactive')` (confirma se há sessões vivas)
- [ ] `quitFlow.ts`: flag injetada `installOnQuit`; no passo final chamar `autoUpdater.quitAndInstall(false, true)` em vez de `app.quit()`
- [ ] Garantir killAll de sessões e stop do daemon antes
### 2. Testes
- [ ] Testes de `quitFlow`: com e sem update pendente, cancelamento no diálogo, sem reentrada

## Acceptance Criteria
- [ ] Nenhum processo órfão; sem loop; cancelar mantém o app aberto

## Testing Requirements
```bash
pnpm typecheck && pnpm lint && pnpm vitest run
```

## Rollback Plan
Reverter o commit desta spec.
