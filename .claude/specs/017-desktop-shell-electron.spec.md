---
title: Pacote desktop — janela, daemon filho, bandeja e instância única
number: 017
priority: high
tags: [feature, desktop, electron, infra]
dependencies: [016-permission-card-web-ui.spec.md, 012-hall-of-fame-packaging-e2e.spec.md]
related_prd: ../prds/desktop-app-permissions.prd.md
status: pending
created: 2026-10-10
---

# 017 - Pacote desktop — janela, daemon filho, bandeja e instância única

## Overview
Cria `packages/desktop` (Electron): janela que carrega a web servida pelo daemon, daemon embutido como `utilityProcess` na porta 4777 (ou conexão a um daemon `agents-office` já existente), bandeja que mantém o app ao fechar a janela, menu "Sair", instância única e reinício do daemon em caso de crash.

## Related PRD
- **Source**: [Agents Office Desktop e aprovação de permissões](../prds/desktop-app-permissions.prd.md)
- **Section Reference**: User Stories 1-7, 9; Implementation Decisions → Electron, daemon como processo filho, bandeja

## Prerequisites
- [ ] Spec 016 concluído
- [ ] Spec 012 concluído (build do daemon e da web)

## Dependencies
- `016-permission-card-web-ui.spec.md`: UI completa de permissões
- `012-hall-of-fame-packaging-e2e.spec.md`: pacote cli e web buildada

## Implementation Tasks
### 1. Pacote (`packages/desktop`)
- [ ] `package.json` (`@agents-office/desktop`, privado), Electron e electron-builder pinados, scripts `dev`, `build`, `start`
- [ ] TypeScript estrito; processo principal em `src/main/`, preload mínimo em `src/preload/`; biome/typecheck cobrindo o pacote
### 2. Daemon filho (`src/main/daemonProcess.ts`)
- [ ] Iniciar o daemon via `utilityProcess` (ou `child_process.fork` do build de `packages/cli`) com `--no-open`, porta 4777 (configurável), logs encaminhados
- [ ] Probe prévio em `GET /health`: se já há um `agents-office` na porta, não iniciar outro; marcar o modo "conectado a daemon externo" e avisar o usuário
- [ ] Porta ocupada por outro programa: erro claro na janela
- [ ] Crash do daemon: reiniciar com backoff (máx. 3 tentativas/min) e notificar
### 3. Janela, bandeja e ciclo (`src/main/`)
- [ ] `BrowserWindow` carregando `http://127.0.0.1:<porta>/`; `contextIsolation`, sem `nodeIntegration`, navegação externa bloqueada/aberta no navegador padrão
- [ ] `requestSingleInstanceLock`; segunda instância traz a janela à frente
- [ ] Fechar a janela esconde (bandeja) e mantém o daemon; menu da bandeja: Mostrar, Status do daemon, Sair; "Sair" encerra janela e daemon
- [ ] Notificação do sistema quando um pedido de permissão chega com a janela sem foco (consome `permission.requested` do daemon)
- [ ] Lógica pura (decisão de probe/modo, backoff) em módulos sem Electron, testados com Vitest
### 4. Testing
- [ ] `test/daemonProcess.test.ts` (probe, backoff) e `test/lifecycle.test.ts` (estado janela/bandeja) com dobras de Electron
- [ ] Teste de fumaça Playwright para Electron: app abre, daemon sobe, fechar a janela mantém o processo, "Sair" encerra tudo

## Acceptance Criteria
### Must Have
- [ ] App abre e mostra o escritório em Linux
- [ ] Fechar a janela mantém o daemon; Sair encerra tudo
- [ ] Hooks existentes (porta 4777) continuam funcionando

### Should Have
- [ ] Verificado manualmente em macOS
- [ ] Ícone de bandeja com estado (pedidos pendentes)

## Testing Requirements
```bash
pnpm --filter @agents-office/desktop test
pnpm --filter @agents-office/desktop build
pnpm typecheck && pnpm lint
```

## Rollback Plan
Remover `packages/desktop` e a entrada no workspace; o CLI `npx agents-office` continua independente.
