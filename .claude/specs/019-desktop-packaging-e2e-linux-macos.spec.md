---
title: Empacotamento Linux/macOS e E2E do app desktop
number: 019
priority: medium
tags: [feature, desktop, release, e2e, testing]
dependencies: [017-desktop-shell-electron.spec.md, 018-hooks-management-from-ui.spec.md]
related_prd: ../prds/desktop-app-permissions.prd.md
status: pending
created: 2026-10-10
---

# 019 - Empacotamento Linux/macOS e E2E do app desktop

## Overview
Empacota o app com electron-builder para Linux (AppImage e `.deb`) e macOS (`.dmg`), sem assinatura nem atualização automática na v1, e fecha a suíte E2E do app (Playwright para Electron) cobrindo o fluxo completo de aprovação de permissões.

## Related PRD
- **Source**: [Agents Office Desktop e aprovação de permissões](../prds/desktop-app-permissions.prd.md)
- **Section Reference**: Implementation Decisions → Plataformas; Testing Decisions → Electron

## Prerequisites
- [ ] Specs 017 e 018 concluídos

## Dependencies
- `017-desktop-shell-electron.spec.md`: app Electron
- `018-hooks-management-from-ui.spec.md`: tela de hooks

## Implementation Tasks
### 1. electron-builder
- [ ] `electron-builder.yml`: alvos `AppImage`, `deb`, `dmg`; `files` com o build do daemon, a web e a skin padrão; `asar` configurado e módulos nativos fora do asar quando necessário (`asarUnpack` para `node-pty`; spike 013: no Linux o `node-pty` 1.1 não tem prebuild e compila no install, exigindo `g++`/`make`/`python3` no CI; é N-API e carregou no Electron 44.7 com e sem `@electron/rebuild`; empacotamento com asar e macOS NÃO foram verificados no spike)
- [ ] Ícone do app e da bandeja (arte original CC0), nome `Agents Office`, `appId`
- [ ] Script `pnpm --filter @agents-office/desktop dist` que roda `pnpm build` antes
- [ ] Checagem automática de licenças dos assets empacotados (reutilizar o teste do pacote cli)
### 2. CI
- [ ] Estender `.github/workflows/ci.yml`: build do app em Linux; macOS em job separado (sem assinatura)
### 3. E2E (Playwright para Electron) (`e2e/desktop/`)
- [ ] Iniciar o app empacotado/dev com `--projects-dir` temporário e `HOME` temporário
- [ ] Fluxo: alimentar fixture → personagem aparece → POST /hook/permission → cartão e notificação → Aprovar → o hook recebe `allow`
- [ ] Fechar a janela mantém o daemon (health OK); "Sair" encerra o processo
- [ ] Reiniciar o daemon: a janela reconecta
### 4. Documentação
- [ ] README: seção "App desktop" (instalação, hooks pela UI, aprovação de permissões, limitações: sem assinatura macOS, sem auto-update, só Linux/macOS)
- [ ] Documentar o aviso do Gatekeeper no macOS e como abrir

## Acceptance Criteria
### Must Have
- [ ] `.AppImage`/`.deb` gerados e abrindo em Linux
- [ ] E2E do app passa em headless/xvfb
- [ ] Nenhum asset não-CC0 empacotado

### Should Have
- [ ] `.dmg` gerado em CI de macOS
- [ ] Verificação manual em macOS registrada

## Testing Requirements
```bash
pnpm build
pnpm --filter @agents-office/desktop dist
pnpm --filter @agents-office/e2e exec playwright test desktop
```

## Rollback Plan
Remover a configuração do electron-builder e o job de CI; o app continua rodando em modo dev.
