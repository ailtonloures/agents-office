---
title: Reabertura explícita do roster e migração do legado
number: 094
priority: high
tags: [bugfix, desktop, shared, roster, testing]
dependencies: []
related_prd: ../prds/tech-lead-fantasma-sessoes-ociosas.prd.md
status: done
created: 2026-10-12
---

# 094 - Reabertura explícita do roster e migração do legado

## Overview
Conclui o fix de reopen-on-launch que já está no working tree (`reopen` no roster, `setReopen`, `beginShutdown`) e troca o padrão do schema para "não reabrir", para que entradas gravadas por versões antigas não reabram o Tech Lead fantasma.

## Related PRD
- **Source**: [Fim do Tech Lead fantasma](../prds/tech-lead-fantasma-sessoes-ociosas.prd.md)
- **Section Reference**: User Stories 1-6, 13, 15, 17, 18

## Prerequisites
- [ ] Ler `git diff` de `packages/shared/src/desktopProfiles.ts`, `rosterStore.ts`, `managedSessions.ts`, `main.ts` e dos testes correspondentes
- [ ] Ler `.claude/learnings/perfis-agent-bus.md`

## Dependencies
Nenhuma.

## Implementation Tasks
### 1. Contrato
- [ ] `packages/shared/src/desktopProfiles.ts`: `reopen` com `.default(false)` nos dois schemas de entrada do roster; manter `z.looseObject`
### 2. Desktop
- [ ] `rosterStore.ts`: `start` grava `reopen: true`; `setReopen(cwd, entryId, reopen)` persiste com `writeJsonAtomic`; `backupCorrupt` preservado
- [ ] `managedSessions.ts`: `handleExit` grava `reopen=false` quando não é `shuttingDown`; `reopenAll` ignora `!entry.reopen`
- [ ] `main.ts`: `beginShutdown()` antes de `killAll` (já no diff); confirmar o caminho de `before-quit` e de fechar janela
### 3. Testes
- [ ] `packages/desktop/test/rosterStore.test.ts`: arquivo legado sem `reopen` carrega com `false`; novas entradas gravam `true`; arquivo corrompido vai para backup
- [ ] `packages/desktop/test/managedSessions.test.ts`: encerrada pelo usuário não reabre; encerramento do app preserva `reopen`; entradas legadas não reabrem
### 4. Docs
- [ ] Atualizar `.claude/learnings/perfis-agent-bus.md` (pt-BR) com a decisão do padrão e a migração

## Acceptance Criteria
### Must Have
- [ ] Com o `rosters.json` atual do usuário, nenhum Tech Lead fantasma aparece ao abrir o app
- [ ] Sessões abertas ao fechar o app reabrem no lançamento seguinte
- [ ] Sessão fechada pelo usuário não reabre
### Should Have
- [ ] Learning atualizado

## Testing Requirements
```bash
pnpm typecheck && pnpm lint && pnpm vitest run
```

## Rollback Plan
Reverter o commit desta spec; o `rosters.json` volta a ser lido sem o campo.
