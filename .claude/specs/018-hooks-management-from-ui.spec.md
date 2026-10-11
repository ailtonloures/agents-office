---
title: Instalar, ver status e remover hooks pela interface
number: 018
priority: medium
tags: [feature, desktop, web, hooks]
dependencies: [017-desktop-shell-electron.spec.md, 015-hook-permission-request-and-settings-merger.spec.md]
related_prd: ../prds/desktop-app-permissions.prd.md
status: pending
created: 2026-10-10
---

# 018 - Instalar, ver status e remover hooks pela interface

## Overview
Expõe pelo app o que o CLI `hooks install|uninstall|status` já faz: uma tela de configurações com o estado por evento, botões para instalar/remover (com prévia do diff) e o `hooksSeenAt` do daemon, usando uma ponte IPC mínima. Na primeira execução, o app sugere instalar os hooks.

## Related PRD
- **Source**: [Agents Office Desktop e aprovação de permissões](../prds/desktop-app-permissions.prd.md)
- **Section Reference**: User Story 8; Implementation Decisions → desktop

## Prerequisites
- [ ] Specs 015 e 017 concluídos

## Dependencies
- `017-desktop-shell-electron.spec.md`: processo principal e preload
- `015-hook-permission-request-and-settings-merger.spec.md`: SettingsMerger completo

## Implementation Tasks
### 1. Serviço no processo principal (`src/main/hooksService.ts`)
- [ ] Reutilizar o `SettingsMerger` exportado do daemon (ou do pacote cli) para `status`, `previewInstall`, `install`, `uninstall`
- [ ] O comando gravado nos hooks aponta para o binário **do app** (caminho absoluto resolvido; funcionar mesmo sem `npx`); manter `agents-office hook` identificável pelo marcador
- [ ] Respeitar backup `.agents-office.bak` e idempotência
### 2. Ponte IPC (`src/preload/`)
- [ ] API mínima e tipada exposta por `contextBridge`: `hooks.status()`, `hooks.preview()`, `hooks.install()`, `hooks.uninstall()`; validar origem/remetente no processo principal
### 3. UI (`packages/web/src/ui/settingsPanel.ts` ou tela HTML)
- [ ] Tela "Hooks": estado por evento (instalado/não), `hooksSeenAt`, prévia do diff antes de confirmar, botões Instalar/Remover
- [ ] Aviso na primeira execução quando nenhum hook está instalado (descartável, lembra a escolha)
- [ ] Fora do Electron a tela fica oculta
### 4. Testing
- [ ] Testes do serviço com `HOME` temporário (install/uninstall/idempotência, nunca o settings real)
- [ ] Teste do contrato da ponte (mock do `ipcRenderer`)

## Acceptance Criteria
### Must Have
- [ ] Instalar e remover pela UI produz o mesmo resultado do CLI, byte a byte no uninstall
- [ ] Settings real não é tocado pelos testes

### Should Have
- [ ] Prévia do diff visível antes de confirmar

## Testing Requirements
```bash
pnpm --filter @agents-office/desktop test hooks
pnpm typecheck && pnpm lint
```

## Rollback Plan
Remover `hooksService.ts`, a ponte e a tela; o CLI continua disponível.
