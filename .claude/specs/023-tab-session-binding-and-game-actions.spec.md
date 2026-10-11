---
title: Vínculo aba ↔ sessão e ações no diálogo do jogo
number: 023
priority: high
tags: [feature, desktop, web, interaction]
dependencies: [022-project-catalog-and-picker.spec.md, 021-terminal-panel-xterm.spec.md]
related_prd: ../prds/desktop-terminal-sessions.prd.md
status: pending
created: 2026-10-10
---

# 023 - Vínculo aba ↔ sessão e ações no diálogo do jogo

## Overview
Liga cada aba de terminal à sessão correspondente no escritório (para que o Tech Lead de uma sessão do app saiba qual aba o controla) e adiciona as ações "Iniciar sessão" e "Abrir terminal" ao diálogo do jogo.

## Related PRD
- **Source**: [Sessões em terminal embutido e VS Code](../prds/desktop-terminal-sessions.prd.md)
- **Section Reference**: User Stories 4, 12-13; Implementation Decisions → shared (AppSession)

## Prerequisites
- [ ] Specs 021 e 022 concluídos
- [ ] Spec 013: **confirmado** que `AGENTS_OFFICE_TERMINAL_ID` passada ao pty é visível no ambiente do hook (não vem no payload, só no env); o plano por cwd+tempo fica apenas como contingência. Requer o env do pty sem `CLAUDE_CODE_*` herdados, senão não há transcript (spec 020)

## Dependencies
- `022-project-catalog-and-picker.spec.md`: iniciar sessão
- `021-terminal-panel-xterm.spec.md`: abas

## Implementation Tasks
### 1. Vínculo (`shared` + daemon + desktop)
- [ ] `shared`: tipo `AppSession` {terminalId, cwd, startedTs, sessionId?}; `Session` ganha `terminalId?` opcional (retrocompatível, atualizar schema e testes)
- [ ] Hook `SessionStart` (e demais) passa o `AGENTS_OFFICE_TERMINAL_ID` quando existir no ambiente do hook: o comando `hook` inclui o valor no POST (campo `terminalId`)
- [ ] Normalizer/reducer propagam `terminalId` para a sessão; plano B (só se o env faltar): casar por `cwd` + horário de início mais próximo
- [ ] Testes de Normalizer/reducer para o vínculo, incluindo hook antes do JSONL
### 2. Ações no jogo (`OfficeScene`, `dialogContent.ts`)
- [ ] Ponto de interação na sala (por exemplo, a porta ou uma mesa de "nova sessão") que abre o `ProjectPicker` já no projeto da sala
- [ ] Diálogo do Tech Lead de uma sessão do app: opção "Abrir terminal" que foca a aba vinculada; para sessões externas a opção não aparece
- [ ] Ações visíveis só dentro do Electron
### 3. Testing
- [ ] Unidade: formatter de diálogo com/sem ações; vínculo no reducer
- [ ] E2E: iniciar sessão (claude falso que dispara um `SessionStart` simulado) → Tech Lead aparece vinculado → "Abrir terminal" foca a aba certa

## Acceptance Criteria
### Must Have
- [ ] Sessão iniciada pelo app aparece no escritório já vinculada à sua aba
- [ ] Sessões externas nunca mostram "Abrir terminal"

### Should Have
- [ ] Estado da sessão refletido no título da aba

## Testing Requirements
```bash
pnpm test
pnpm --filter @agents-office/e2e exec playwright test desktop
pnpm typecheck && pnpm lint
```

## Rollback Plan
Remover o campo `terminalId` e as ações; reverter o `hook`.
