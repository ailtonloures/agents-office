---
title: Grafo de conexões entre agentes e painel "pode falar com"
number: 067
priority: high
tags: [feature, desktop, web, ui, testing]
dependencies: [065-painel-elenco-editor-perfil.spec.md]
related_prd: ../prds/comunicacao-entre-agentes.prd.md
status: pending
created: 2026-10-11
---

# 067 - Grafo de conexões entre agentes e painel "pode falar com"

## Overview
Conexões explícitas e bidirecionais entre agentes do elenco, persistidas no projeto, com checklist por agente.

## Related PRD
- **Source**: [Comunicação entre agentes e reuniões no escritório](../prds/comunicacao-entre-agentes.prd.md)

## Prerequisites
- [ ] `065-painel-elenco-editor-perfil.spec.md` concluída

## Dependencies
- [065-painel-elenco-editor-perfil.spec.md]

## Implementation Tasks
### 1. Modelo
- [ ] `src/main/connectionGraph.ts`: pares não ordenados, conectar/desconectar, consultas `podeFalar(a,b)`
- [ ] Persistir no elenco do projeto; remover conexões ao remover agente
### 2. UI
- [ ] Checklist "pode falar com" no painel Elenco
### 3. Testes
- [ ] `connectionGraph.test.ts`: bidirecionalidade, remoção em cascata

## Acceptance Criteria
- [ ] Sem conexão não há entrega possível
- [ ] Conexão vale nos dois sentidos
- [ ] `pnpm typecheck && pnpm lint && pnpm vitest run` verdes

## Testing Requirements
```bash
pnpm typecheck && pnpm lint && pnpm vitest run
```

## Rollback Plan
Reverter o commit desta spec.
