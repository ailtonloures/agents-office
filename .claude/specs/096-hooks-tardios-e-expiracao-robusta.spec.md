---
title: Hooks tardios não criam sessão e expiração robusta
number: 096
priority: medium
tags: [bugfix, daemon, normalizer, liveness, testing]
dependencies: []
related_prd: ../prds/tech-lead-fantasma-sessoes-ociosas.prd.md
status: done
created: 2026-10-12
---

# 096 - Hooks tardios não criam sessão e expiração robusta

## Overview
Impede que `Notification`/`Stop` de uma sessão desconhecida criem um Tech Lead anônimo e garante que um horário corrompido não bloqueie a expiração.

## Related PRD
- **Source**: [Fim do Tech Lead fantasma](../prds/tech-lead-fantasma-sessoes-ociosas.prd.md)
- **Section Reference**: User Stories 9, 10, 11, 12, 19

## Prerequisites
- [ ] Ler `packages/daemon/src/normalizer/normalizer.ts` (`startSession`, `startSessionFromHook`) e `packages/daemon/src/model/liveness.ts`
- [ ] Spike: confirmar quais hooks do Claude Code carregam `cwd` e se a regra nova quebra o uso normal (sessão iniciada sem `SessionStart`); registrar em learning

## Dependencies
Nenhuma.

## Implementation Tasks
### 1. Daemon
- [ ] `startSessionFromHook`: só criar sessão desconhecida em `SessionStart` e em prompt do usuário; sessões já conhecidas seguem normais
- [ ] `liveness.ts` (`lastActivity` e `tick`): tratar `NaN` com `Number.isNaN`, tratando como expirado
### 2. Testes
- [ ] `packages/daemon/test/normalizer.hooks.test.ts`: `Notification`/`Stop` tardio de sessão desconhecida não cria sessão; sessão conhecida continua atualizando
- [ ] `packages/daemon/test/liveness.test.ts`: `lastActivityTs` inválido expira

## Acceptance Criteria
### Must Have
- [ ] Nenhuma sessão nova sai de hook que não seja de início/prompt
- [ ] Sessão com horário corrompido expira
### Should Have
- [ ] Learning registrando a decisão

## Testing Requirements
```bash
pnpm typecheck && pnpm lint && pnpm vitest run
```

## Rollback Plan
Reverter o commit desta spec.
