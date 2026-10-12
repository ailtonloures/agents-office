---
title: Papel Orquestrador e ferramentas spawn_agent / dismiss_agent
number: 072
priority: high
tags: [feature, desktop, mcp, orchestrator, testing]
dependencies: [068-mensagens-fila-entrega.spec.md, 064-sessoes-gerenciadas-reabertura.spec.md]
related_prd: ../prds/orquestrador-de-agentes.prd.md
status: pending
created: 2026-10-11
---

# 072 - Papel Orquestrador e ferramentas spawn_agent / dismiss_agent

## Overview
Ferramentas de criação e encerramento de agentes, expostas só a perfis Orquestrador, com limite de 2 agentes criados ativos e conexão automática.

## Related PRD
- **Source**: [Orquestrador que cria agentes na hora](../prds/orquestrador-de-agentes.prd.md)

## Prerequisites
- [ ] `068-mensagens-fila-entrega.spec.md` concluída
- [ ] `064-sessoes-gerenciadas-reabertura.spec.md` concluída

## Dependencies
- [068-mensagens-fila-entrega.spec.md]
- [064-sessoes-gerenciadas-reabertura.spec.md]

## Implementation Tasks
### 1. Ferramentas
- [ ] Exposição condicional por papel no Agent Bus
- [ ] `spawn_agent(name,profession,instructions,task?)`: valida, nome único, grava no elenco com `criadoPor`, conecta ao orquestrador, inicia sessão
- [ ] Limite 2 ativos por orquestrador (constante), erro estruturado
- [ ] `dismiss_agent(name)` só para agentes criados pelo próprio orquestrador; orquestrador não cria orquestrador
### 2. Testes
- [ ] `spawnAgent.test.ts`: papel, limite, duplicado, dono × outro

## Acceptance Criteria
- [ ] Agente comum não vê as ferramentas
- [ ] Terceira criação é recusada
- [ ] `pnpm typecheck && pnpm lint && pnpm vitest run` verdes

## Testing Requirements
```bash
pnpm typecheck && pnpm lint && pnpm vitest run
```

## Rollback Plan
Reverter o commit desta spec.
