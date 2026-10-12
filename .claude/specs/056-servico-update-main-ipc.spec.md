---
title: Serviço de update no processo principal e IPC
number: 056
priority: high
tags: [feature, desktop, updater, ipc]
dependencies: [055-config-publicacao-workflow-release.spec.md]
related_prd: ../prds/auto-update-releases.prd.md
status: done
created: 2026-10-11
---

# 056 - Serviço de update no processo principal e IPC

## Overview
Serviço puro de update (estados, checagem periódica) e canal IPC com push de status, ativo só no AppImage empacotado.

## Related PRD
- **Source**: [Auto-update e releases](../prds/auto-update-releases.prd.md)

## Dependencies
- [055-config-publicacao-workflow-release.spec.md]

## Implementation Tasks
### 1. Serviço
- [ ] `src/main/updater.ts` sem import do Electron: `createUpdateService({ autoUpdater, isPackaged, isAppImage, emit, now })`
- [ ] No-op quando não empacotado ou fora de AppImage
- [ ] autoDownload, autoInstallOnAppQuit; checa 15 s após boot e a cada 4 h
- [ ] Estados: idle, checking, available, downloading, ready, error; `checkNow`, `install`, `getState`
### 2. IPC
- [ ] `updaterChannels.ts` e `updaterIpc.ts` (handlers com `trusted()` + zod; push via `webContents.send`)
- [ ] Inicializar em `main.ts` após `whenReady`; notificação nativa em `ready` via `notify()`
- [ ] Itens "Verificar atualizações"/"Reiniciar para atualizar" na bandeja (`Shell`) e em `buildAppMenu`
### 3. Testes
- [ ] `packages/desktop/test/updater.test.ts` com autoUpdater falso (no-op, fluxo completo, erro/retry, install)

## Acceptance Criteria
- [ ] Transições de estado corretas e emitidas; deb/dev não checam
- [ ] Falhas de rede não derrubam o app

## Testing Requirements
```bash
pnpm typecheck && pnpm lint && pnpm vitest run
```

## Rollback Plan
Reverter o commit desta spec.
