---
title: TerminalPanel — painel acoplado com abas (xterm.js)
number: 021
priority: high
tags: [feature, web, desktop, terminal, ui]
dependencies: [020-session-manager-pty-ipc.spec.md, 016-permission-card-web-ui.spec.md]
related_prd: ../prds/desktop-terminal-sessions.prd.md
status: pending
created: 2026-10-10
---

# 021 - TerminalPanel — painel acoplado com abas (xterm.js)

## Overview
Painel inferior acoplado e redimensionável com uma aba por sessão iniciada pelo app, usando `xterm.js` ligado ao IPC do SessionManager. Recolhe com atalho, reidrata o histórico ao reabrir a janela e convive com o escritório e com o cartão de permissões.

## Related PRD
- **Source**: [Sessões em terminal embutido e VS Code](../prds/desktop-terminal-sessions.prd.md)
- **Section Reference**: User Stories 8-11, 14-15, 17; Implementation Decisions → TerminalPanel, UI

## Prerequisites
- [ ] Specs 020 e 016 concluídos

## Dependencies
- `020-session-manager-pty-ipc.spec.md`: IPC de terminal
- `016-permission-card-web-ui.spec.md`: cartão sobre o escritório

## Implementation Tasks
### 1. Dependências e estrutura
- [ ] `@xterm/xterm`, `@xterm/addon-fit` (e web-links opcional) pinados em `packages/web`; CSS do xterm incluído no build
- [ ] Painel em DOM sobre/ao lado do canvas Phaser (`src/ui/terminalPanel.ts`); o canvas redimensiona a área visível sem quebrar o zoom inteiro
### 2. Comportamento
- [ ] Abas por sessão com título `projeto · estado`; fechar aba com confirmação se o `claude` estiver ativo; aba de sessão encerrada mostra "processo terminou" e permite fechar ou reiniciar
- [ ] Redimensionar o painel por arraste; atalho para recolher/expandir; `fit` envia `resize` ao pty
- [ ] Reidratar: ao abrir/reabrir a janela, `terminal.buffer(id)` repõe o histórico antes de seguir o fluxo ao vivo
- [ ] Foco: teclado vai ao terminal quando o painel está focado e ao player quando o foco é do canvas; indicar visualmente o foco; cartão de permissão pode ser decidido por clique sem tirar o foco do terminal
- [ ] Copiar/colar, rolagem, cores e cursor funcionando
- [ ] Fora do Electron o painel não aparece
### 3. Testing
- [ ] Lógica pura (`terminalTabs.ts`: modelo de abas, títulos, foco) testada com Vitest
- [ ] E2E (Playwright Electron) com `claude` falso: aba aparece, mostra a saída, redimensiona, recolhe, buffer após recarregar a janela

## Acceptance Criteria
### Must Have
- [ ] Terminal utilizável de ponta a ponta com o `claude` falso
- [ ] Histórico reidratado ao reabrir a janela
- [ ] Zoom inteiro do escritório preservado

### Should Have
- [ ] Links clicáveis no terminal

## Testing Requirements
```bash
pnpm --filter @agents-office/web test terminalTabs
pnpm --filter @agents-office/e2e exec playwright test desktop
pnpm typecheck && pnpm lint
```

## Rollback Plan
Remover `terminalPanel.ts`, `terminalTabs.ts` e as dependências xterm; o app volta a ser só visualização/aprovação.
