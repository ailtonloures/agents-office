---
title: Personagem preso em "leaving" (condicional)
number: 097
priority: low
tags: [bugfix, web, phaser, characters, testing]
dependencies: [094, 095, 096]
related_prd: ../prds/tech-lead-fantasma-sessoes-ociosas.prd.md
status: skipped
created: 2026-10-12
---

# 097 - Personagem preso em "leaving" (condicional)

## Overview
Só executar se o fantasma persistir após 094-096. Um personagem cuja sessão saiu do modelo entra em `leaving` e só vira `gone` ao chegar; se o goal `exit` não resolve (sala sem porta), ele pode ficar para sempre.

## Related PRD
- **Source**: [Fim do Tech Lead fantasma](../prds/tech-lead-fantasma-sessoes-ociosas.prd.md)
- **Section Reference**: User Story 21

## Prerequisites
- [ ] Reproduzir com evidência (estado das sessões do daemon + personagem na cena) antes de alterar código
- [ ] Ler `characterMachine.ts`, `characterController.ts` (`resolveGoal` do `exit`) e `layoutInput.ts`

## Dependencies
- 094, 095 e 096 concluídas e o fantasma ainda presente

## Implementation Tasks
### 1. Web
- [ ] Lógica pura em `characterMachine.ts` (`now` injetado): forçar `gone` após timeout quando o `exit` não resolve
### 2. Testes
- [ ] `packages/web/test/characterMachine.test.ts` e `layoutInput.test.ts`: sala sem porta não prende o personagem
### 3. Docs
- [ ] Learning sobre a causa confirmada

## Acceptance Criteria
### Must Have
- [ ] Nenhum personagem fica em `leaving` além do timeout
### Should Have
- [ ] Sem mudança visual para o caso normal

## Testing Requirements
```bash
pnpm typecheck && pnpm lint && pnpm vitest run
```

## Rollback Plan
Reverter o commit desta spec.
