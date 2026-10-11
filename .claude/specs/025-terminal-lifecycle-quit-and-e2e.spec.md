---
title: Ciclo de vida das sessões — bandeja, Sair e E2E do fluxo completo
number: 025
priority: medium
tags: [feature, desktop, e2e, testing]
dependencies: [020-session-manager-pty-ipc.spec.md, 021-terminal-panel-xterm.spec.md, 024-external-opener-vscode.spec.md, 019-desktop-packaging-e2e-linux-macos.spec.md]
related_prd: ../prds/desktop-terminal-sessions.prd.md
status: pending
created: 2026-10-10
---

# 025 - Ciclo de vida das sessões — bandeja, Sair e E2E do fluxo completo

## Overview
Fecha o PRD: garante que os ptys sobrevivam ao fechar a janela, que "Sair" liste as sessões ativas e peça confirmação antes de encerrá-las de forma limpa, que um crash do app deixe os transcripts para `--resume`, e entrega o E2E do fluxo completo (iniciar sessão → terminal → aprovação → VS Code).

## Related PRD
- **Source**: [Sessões em terminal embutido e VS Code](../prds/desktop-terminal-sessions.prd.md)
- **Section Reference**: User Stories 14-18; Testing Decisions

## Prerequisites
- [ ] Specs 019, 020, 021 e 024 concluídos

## Dependencies
- `020-session-manager-pty-ipc.spec.md`: ptys
- `021-terminal-panel-xterm.spec.md`: painel
- `024-external-opener-vscode.spec.md`: botões completos
- `019-desktop-packaging-e2e-linux-macos.spec.md`: E2E do app

## Implementation Tasks
### 1. Sair com confirmação
- [ ] Menu da bandeja e `app.quit`: se há sessões com processo ativo, diálogo nativo listando-as (projeto, tempo ativo) com Cancelar / Encerrar tudo
- [ ] Ao confirmar: `kill` de cada pty (SIGHUP → SIGKILL), esperar a saída, depois encerrar o daemon e o app; sem sessões ativas, sair direto
- [ ] Encerramento do sistema/logout: tratar `before-quit`/`SIGTERM` com o mesmo caminho limpo, sem confirmação interativa
### 2. Fechar janela e reabrir
- [ ] Fechar a janela mantém ptys e buffers; reabrir reconecta as abas e reidrata o buffer (garantido por testes)
- [ ] Sessão cujo processo terminou enquanto a janela estava oculta aparece como encerrada ao reabrir
### 3. Crash e retomada
- [ ] Ao iniciar, detectar abas que existiam e perderam o processo (registro leve de sessões do app no arquivo de config) e oferecer "Retomar" (`--resume` com o id da sessão quando conhecido, senão `--continue`)
### 4. Testing (E2E do fluxo completo, Playwright Electron)
- [ ] `claude` falso e `code` falso: Iniciar sessão pelo picker → aba mostra saída → Tech Lead aparece vinculado → POST /hook/permission → Aprovar pelo cartão → botão VS Code registra a chamada
- [ ] Fechar a janela e reabrir: buffer e abas intactos; "Sair" mostra a lista e encerra os processos (verificar que não restaram filhos)
- [ ] Simular crash do app (kill -9) e reabrir: oferta de retomar
- [ ] Verificação manual em Linux e macOS com o Claude Code real, registrada em `.claude/learnings/`

## Acceptance Criteria
### Must Have
- [ ] Nenhum processo órfão após "Sair"
- [ ] Fluxo completo passa no E2E em headless/xvfb
- [ ] Confirmação de saída lista as sessões ativas

### Should Have
- [ ] Verificação manual em macOS documentada

## Testing Requirements
```bash
pnpm test
pnpm --filter @agents-office/e2e exec playwright test desktop
pnpm typecheck && pnpm lint
```

## Rollback Plan
Reverter o diálogo de saída e o registro de sessões; as sessões continuam funcionando sem a confirmação.
