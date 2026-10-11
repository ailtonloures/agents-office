---
title: Finalizar sub-agentes ociosos por inatividade (liveness)
number: 036
priority: medium
tags: [feature, daemon, testing]
dependencies: [035]
related_prd: ../prds/avatar-subagente-orfao.prd.md
status: todo
created: 2026-10-11
---

# 036 - Finalizar sub-agentes ociosos por inatividade (liveness)

## Overview
Rede de segurança para o caso em que o agente morto nunca é recriado: hoje `liveness.tick` só o põe em `idle` e o `SETTLED` o ignora para sempre. Passa a emitir `agent.finished` (origem `clock`) para agentes ociosos além de um limite configurável.

## Related PRD
- **Source**: [Avatar de sub-agente órfão](../prds/avatar-subagente-orfao.prd.md)
- **Section Reference**: User Stories 7–11, 16; Implementation Decisions (rede de segurança)

## Prerequisites
- [ ] Spec 035 concluída (reutiliza o caminho de finalização)

## Dependencies
- 035

## Implementation Tasks
### 1. Liveness (`packages/daemon/src/model/liveness.ts`)
- [ ] Adicionar `agentExpireAfterMs` (padrão 300_000) a `LivenessConfig` e `DEFAULT_LIVENESS_CONFIG`
- [ ] Em `tick`, antes do `continue` por `SETTLED`, emitir `agent.finished` com `source: 'clock'` para agentes `idle` com silêncio `>= agentExpireAfterMs`; `finished`/`ended` continuam ignorados
- [ ] Conferir o shape de `agent.finished` em `packages/shared/src/events.ts` e que o reducer trata `clock` como não-atividade
- [ ] Atualizar o comentário do módulo
### 2. Testes (`packages/daemon/test/liveness.test.ts`)
- [ ] Idle além do limite → `agent.finished`; abaixo → nada; `working`/`thinking` → só o fluxo idle existente
- [ ] Não gera evento duplicado para agente já `finished`; sessão-mãe inalterada
- [ ] Limite customizado via config respeitado

## Acceptance Criteria
- [ ] Sub-agente ocioso por mais que o limite sai do escritório sem ser recriado
- [ ] Contador do HUD e `/health` diminuem
- [ ] Nenhum agente em atividade é finalizado

## Verification
`pnpm -r test`, typecheck, `pnpm biome check`. Manual: deixar um sub-agente ocioso por mais de 5 min e conferir a saída do avatar.
