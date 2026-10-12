---
title: Reação do avatar, E2E e documentação do navegador
number: 085
priority: low
tags: [docs, testing, e2e, web]
dependencies: [084-browser-seletor-elemento-contexto.spec.md, 083-browser-confirmacoes-pausar.spec.md]
related_prd: ../prds/navegador-embutido.prd.md
status: pending
created: 2026-10-11
---

# 085 - Reação do avatar, E2E e documentação do navegador

## Overview
Avatar reage ao uso do navegador, E2E com página local e documentação.

## Related PRD
- **Source**: [Navegador embutido controlado por agentes](../prds/navegador-embutido.prd.md)

## Prerequisites
- [ ] `084-browser-seletor-elemento-contexto.spec.md` concluída
- [ ] `083-browser-confirmacoes-pausar.spec.md` concluída

## Dependencies
- [084-browser-seletor-elemento-contexto.spec.md]
- [083-browser-confirmacoes-pausar.spec.md]

## Implementation Tasks
### 1. Fechamento
- [ ] Evento de uso do navegador → avatar olha para o computador
- [ ] E2E em `packages/desktop/e2e` com página local
- [ ] Learning `.claude/learnings/navegador-embutido.md`; README

## Acceptance Criteria
- [ ] E2E verde
- [ ] `pnpm typecheck && pnpm lint && pnpm vitest run` verdes

## Testing Requirements
```bash
pnpm typecheck && pnpm lint && pnpm vitest run
```

## Rollback Plan
Reverter o commit desta spec.
