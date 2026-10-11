---
title: Substituir sub-agente ocioso ao recriar agente equivalente
number: 035
priority: high
tags: [feature, shared, daemon, web, testing]
dependencies: []
related_prd: ../prds/avatar-subagente-orfao.prd.md
status: todo
created: 2026-10-11
---

# 035 - Substituir sub-agente ocioso ao recriar agente equivalente

## Overview
Quando um sub-agente morre sem `SubagentStop`, ele fica `idle` e dormindo na mesa; o recriado chega com `agentId` novo e surge por cima. No `agent.spawned`, o reducer passa a finalizar o predecessor ocioso equivalente, o que faz o avatar antigo sair (fluxo `finished → delivering → leaving → gone`) e o novo entrar.

## Related PRD
- **Source**: [Avatar de sub-agente órfão](../prds/avatar-subagente-orfao.prd.md)
- **Section Reference**: User Stories 1–6, 9–15, 17; Implementation Decisions (substituição)

## Prerequisites
- [ ] Nenhum

## Dependencies
- Nenhuma

## Implementation Tasks
### 0. Validar a premissa
- [ ] Confirmar com transcritos/hooks reais que o sub-agente recriado chega com `agentId` novo e quais campos (`agentType`, `description`, `parentAgentId`) se repetem; se o id for o mesmo, parar e rever a spec
### 1. Reducer (`packages/shared/src/reducer.ts`, caso `agent.spawned`)
- [ ] Ao criar agente com id novo, localizar na mesma sessão um predecessor com `status === 'idle'`, mesmo `agentType`, `description` e `parentAgentId`
- [ ] Finalizar o predecessor pelo mesmo caminho do `agent.finished` (status `finished`, Hall da Fama), extraindo helper compartilhado se necessário
- [ ] Não tocar em agentes `working`/`thinking`/`waiting`, de outras sessões, nem na sessão-mãe
- [ ] Agente recriado com o mesmo id mantém o comportamento atual
### 2. Web (`packages/web/src/characters`)
- [ ] Verificar que o personagem do agente finalizado percorre entrega → saída → remoção e que sua mesa é liberada (`deskAssignment`) para o novo; só alterar código se houver sobreposição
### 3. Testes
- [ ] Reducer: spawn equivalente finaliza o `idle`; não finaliza `working`; não cruza sessões; gêmeos em paralelo (ambos working) preservados; Hall da Fama recebe uma entrada
- [ ] E2E (`e2e/support/office.ts`): spawnar sub-agente, deixá-lo ocioso, spawnar equivalente; o antigo some, o novo permanece, HUD conta 1 agente vivo

## Acceptance Criteria
- [ ] Após recriar um sub-agente ocioso, restam um agente vivo e um avatar no escritório
- [ ] O avatar antigo sai com a animação de término normal e o novo entra pela porta
- [ ] Agentes em atividade nunca são substituídos
- [ ] Eventos tardios do agente antigo não o revivem

## Verification
`pnpm -r test`, typecheck, `pnpm biome check`. Manual/E2E: iniciar sessão, disparar sub-agente, interromper, deixá-lo ocioso (~2 min), recriar; conferir saída do antigo e `curl localhost:<porta>/health`.
