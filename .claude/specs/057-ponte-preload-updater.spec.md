---
title: Ponte tipada do updater (shared + preload)
number: 057
priority: medium
tags: [feature, desktop, shared, preload]
dependencies: [056-servico-update-main-ipc.spec.md]
related_prd: ../prds/auto-update-releases.prd.md
status: done
created: 2026-10-11
---

# 057 - Ponte tipada do updater (shared + preload)

## Overview
Expõe o updater à web via ponte tipada opcional.

## Related PRD
- **Source**: [Auto-update e releases](../prds/auto-update-releases.prd.md)

## Dependencies
- [056-servico-update-main-ipc.spec.md]

## Implementation Tasks
### 1. Shared
- [ ] `packages/shared/src/desktopUpdater.ts`: `UpdaterBridge { getState, checkNow, install, onStatus }` e tipos de estado; exportar em `index.ts`
- [ ] `updater?: UpdaterBridge` em `AgentsOfficeDesktop`
### 2. Preload
- [ ] `src/preload/updaterBridge.ts` (modelo `terminalBridge.ts`, com unsubscribe) e registro em `preload/index.ts`
### 3. Testes
- [ ] Teste da ponte com `invoke`/subscribe falsos

## Acceptance Criteria
- [ ] `window.agentsOfficeDesktop.updater` funcional; typecheck verde

## Testing Requirements
```bash
pnpm typecheck && pnpm lint && pnpm vitest run
```

## Rollback Plan
Reverter o commit desta spec.
