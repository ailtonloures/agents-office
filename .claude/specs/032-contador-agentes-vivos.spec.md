---
title: Contador de sessões e agentes conta apenas atores vivos
number: 032
priority: high
tags: [feature, web, daemon, shared, testing]
dependencies: []
related_prd: ../prds/contador-agentes-vivos.prd.md
status: done
created: 2026-10-11
---

# 032 - Contador de sessões e agentes conta apenas atores vivos

## Overview
`hudCounts` e `/health` contam todas as entradas de `model.agents`, inclusive agentes `finished`, que só saem do modelo quando a sessão termina. Introduz um helper compartilhado `isLive` e o usa nos dois pontos.

## Related PRD
- **Source**: [Contador de agentes vivos](../prds/contador-agentes-vivos.prd.md)
- **Section Reference**: User Stories 1–16; Implementation Decisions

## Prerequisites
- [ ] Nenhum

## Dependencies
- Nenhuma

## Implementation Tasks
### 1. Helper compartilhado (`packages/shared`)
- [ ] Adicionar `isLive(actor: { status: string }): boolean` (`status !== 'finished' && status !== 'ended'`) próximo aos tipos do modelo e exportá-lo pelo índice do pacote
- [ ] Teste unitário: `working`/`waiting`/`idle` → vivo; `finished`/`ended` → não vivo
### 2. HUD (`packages/web/src/ui/hudLogic.ts`)
- [ ] Em `hudCounts`, filtrar sessões e agentes com `isLive` antes de contar `sessions`, `agents` e `waiting`
- [ ] Atualizar os comentários de `HudCounts` ("mesma definição do /health: atores vivos")
- [ ] Testes em `hudLogic`: agente `finished` não conta; agente `waiting` + `finished` não conta em `waiting`; permissão pendente continua somando uma vez
### 3. Daemon (`packages/daemon/src/server/daemon.ts`)
- [ ] Em `/health`, calcular `sessions` e `agents` com `isLive`
- [ ] Teste do `/health`: agente finalizado não entra em `agents`
### 4. Fora do escopo
- [ ] Não alterar `reducer.ts` (`agent.finished` continua marcando `finished` e preenchendo o Hall da Fama)

## Acceptance Criteria
- [ ] Ao `agent.finished`, o contador de agentes do HUD diminui em 1
- [ ] `/health` e HUD retornam os mesmos números para o mesmo modelo
- [ ] Hall da Fama, personagens e diálogos inalterados
- [ ] Contador nunca negativo; eventos tardios não alteram a lógica

## Verification
`pnpm -r test`, typecheck, `pnpm biome check`. Manual: abrir sessão, disparar subagentes (sobe), aguardar `SubagentStop` (desce), encerrar sessão (tudo desce); comparar com `curl localhost:<porta>/health`.
