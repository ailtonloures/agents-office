---
title: Cartão de aprovação de criação e "permitir sem perguntar"
number: 073
priority: high
tags: [feature, desktop, web, ui, safety]
dependencies: [072-perfil-orquestrador-spawn.spec.md]
related_prd: ../prds/orquestrador-de-agentes.prd.md
status: pending
created: 2026-10-11
---

# 073 - Cartão de aprovação de criação e "permitir sem perguntar"

## Overview
Cartão que mostra nome, aparência e instruções (editáveis) na primeira criação de cada orquestrador, com opção persistida de dispensar a confirmação.

## Related PRD
- **Source**: [Orquestrador que cria agentes na hora](../prds/orquestrador-de-agentes.prd.md)

## Prerequisites
- [ ] `072-perfil-orquestrador-spawn.spec.md` concluída

## Dependencies
- [072-perfil-orquestrador-spawn.spec.md]

## Implementation Tasks
### 1. Aprovação
- [ ] Cartão via `notificationCenter` + UI; aprovar, negar, editar instruções
- [ ] Persistir "sem perguntar" por orquestrador e projeto
- [ ] `spawn_agent` aguarda a decisão e devolve resultado à ferramenta
### 2. Testes
- [ ] Fluxos aprovado/negado/editado/sem-perguntar

## Acceptance Criteria
- [ ] Negar devolve erro ao orquestrador sem criar agente
- [ ] Preferência vale só para o par orquestrador+projeto
- [ ] `pnpm typecheck && pnpm lint && pnpm vitest run` verdes

## Testing Requirements
```bash
pnpm typecheck && pnpm lint && pnpm vitest run
```

## Rollback Plan
Reverter o commit desta spec.
