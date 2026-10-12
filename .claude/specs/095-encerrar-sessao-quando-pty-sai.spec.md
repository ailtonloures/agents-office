---
title: Encerrar a sessão quando o terminal gerenciado morre
number: 095
priority: high
tags: [bugfix, desktop, daemon, sessions, testing]
dependencies: []
related_prd: ../prds/tech-lead-fantasma-sessoes-ociosas.prd.md
status: done
created: 2026-10-12
---

# 095 - Encerrar a sessão quando o terminal gerenciado morre

## Overview
Hoje, se o pty de uma sessão gerenciada morre sem `SessionEnd` do Claude, o personagem só sai por expiração (15 min). O desktop passa a enviar ao daemon um fim de sessão sintético assim que a saída é inesperada.

## Related PRD
- **Source**: [Fim do Tech Lead fantasma](../prds/tech-lead-fantasma-sessoes-ociosas.prd.md)
- **Section Reference**: User Stories 7, 8, 10

## Prerequisites
- [ ] Ler `managedSessions.handleExit`, `sessionManager.ts` (`pty.onExit`), o caminho de ingestão de hooks do daemon e `normalizer.ts` (`SessionEnd` → `session.ended`)
- [ ] Spike: confirmar como o daemon recebe um `SessionEnd` (HTTP do hook) e como associar o `terminalId` ao `session_id`; registrar em learning se divergir

## Dependencies
Nenhuma (pode ser feita em paralelo com 094; ambas tocam `handleExit`, então fazer o merge com cuidado).

## Implementation Tasks
### 1. Desktop
- [ ] Interface `...Deps` para postar o evento ao daemon, sem importar `fetch`/`electron` direto no módulo
- [ ] Em `handleExit`: se não for saída solicitada nem `shuttingDown`, resolver a sessão do terminal e postar `SessionEnd` sintético; falha de rede não pode lançar
### 2. Daemon
- [ ] Reusar o endpoint de hooks; nenhum evento novo em `events.ts`
### 3. Testes
- [ ] `packages/desktop/test/managedSessions.test.ts`: saída inesperada posta `SessionEnd`; saída pedida e encerramento do app não postam; falha do post não derruba
### 4. Docs
- [ ] Learning sobre o encerramento por saída do pty

## Acceptance Criteria
### Must Have
- [ ] Matar o processo do terminal remove o personagem logo, sem esperar 15 min
- [ ] Sessões vivas não são afetadas
### Should Have
- [ ] Teste e2e desktop se houver ganho de custo baixo

## Testing Requirements
```bash
pnpm typecheck && pnpm lint && pnpm vitest run
```

## Rollback Plan
Reverter o commit; a expiração de 15 min volta a ser o único caminho.
