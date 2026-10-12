---
title: E2E e documentação de perfis e sessões gerenciadas
number: 066
priority: low
tags: [docs, testing, e2e]
dependencies: [065-painel-elenco-editor-perfil.spec.md]
related_prd: ../prds/perfis-sessoes-gerenciadas.prd.md
status: pending
created: 2026-10-11
---

# 066 - E2E e documentação de perfis e sessões gerenciadas

## Overview
E2E de desktop (criar perfil, abrir app, reabertura) e documentação do Agent Bus e dos perfis.

## Related PRD
- **Source**: [Perfis de agente e sessões gerenciadas](../prds/perfis-sessoes-gerenciadas.prd.md)

## Prerequisites
- [ ] `065-painel-elenco-editor-perfil.spec.md` concluída

## Dependencies
- [065-painel-elenco-editor-perfil.spec.md]

## Implementation Tasks
### 1. E2E / docs
- [ ] E2E em `packages/desktop/e2e` com claude falso
- [ ] Learning em `.claude/learnings/perfis-agent-bus.md`
- [ ] Atualizar README

## Acceptance Criteria
- [ ] E2E verde
- [ ] Learning registrado
- [ ] `pnpm typecheck && pnpm lint && pnpm vitest run` verdes

## Testing Requirements
```bash
pnpm typecheck && pnpm lint && pnpm vitest run
```

## Rollback Plan
Reverter o commit desta spec.
