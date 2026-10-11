---
title: RoomLayoutGenerator — uma sala por projeto, gerada por chunks
number: 008
priority: high
tags: [feature, web, world, procedural]
dependencies: [007-web-foundation-client-skin.spec.md]
related_prd: ../prds/agents-office.prd.md
status: pending
created: 2026-10-10
---

# 008 - RoomLayoutGenerator

## Overview
Gera de forma determinística o prédio: uma sala por projeto ativo, com porta, placa com o nome, mesa do Tech Lead por sessão e blocos de baias que crescem com o número de agentes. Inclui grid de colisão e pontos de interesse (rack de servidores, telefone, janela, mural do Hall da Fama).

## Related PRD
- **Source**: [Agents Office](../prds/agents-office.prd.md)
- **Section Reference**: User Stories 11-14, 39, 48; Implementation Decisions → RoomLayoutGenerator

## Prerequisites
- [ ] Spec 007 concluído (skin com ids de tiles)

## Dependencies
- `007-...`: SkinLoader e OfficeScene

## Implementation Tasks
### 1. Gerador puro (`src/world/roomLayout.ts`)
- [ ] `layoutBuilding(projects: {id, name, sessions: {id, agentCount}[]}[]): BuildingLayout`, puro e determinístico
- [ ] Sala = composição de chunks (16x16 tiles por chunk): `entrance` (porta + placa), `lead-desk` (1 por sessão), `cubicles-4` (4 baias), `utility` (rack, telefone, janela, planta)
- [ ] Capacidade: baias ≥ agentes ativos da sala + 1 de folga; adiciona `cubicles-4` conforme necessário
- [ ] Prédio: salas dispostas em grade horizontal ligadas por um corredor; lobby fixo com o mural do Hall da Fama e o spawn do jogador
- [ ] Saída: tilemap (camadas floor/walls/furniture), `collision[][]`, `doors`, `desks: {id, sessionId?, tile, facing}[]`, `pois: {type, tile}[]`, `roomBounds`, `signText`
- [ ] Ordem estável das salas por `firstSeenTs` (novas salas entram à direita, sem embaralhar as existentes)

### 2. Integração na cena (`src/scenes/OfficeScene.ts`)
- [ ] Ao mudar o conjunto de projetos/sessões ou a capacidade, regerar o layout e aplicar diff (não recriar personagens; preservar as atribuições de baia)
- [ ] Renderizar a placa com o nome do projeto (fonte bitmap, truncado em 14 chars)
- [ ] Salas sem sessões somem após os personagens saírem (coordenado com o spec 010)

### 3. Testing
- [ ] `test/roomLayout.test.ts` (Vitest no pacote web): determinismo; 0, 1 e 9 agentes → capacidade suficiente; adicionar um projeto não altera as coordenadas das salas existentes; todas as baias e a porta alcançáveis por BFS no grid de colisão

## Acceptance Criteria
### Must Have
- [ ] Testes do gerador passam (inclusive a alcançabilidade)
- [ ] Visualmente: 2 projetos ativos → 2 salas nomeadas ligadas por corredor

### Should Have
- [ ] Variação cosmética determinística por hash do projeto (cor do piso, posição de plantas)

## Testing Requirements
```bash
pnpm --filter @agents-office/web test roomLayout
pnpm typecheck && pnpm lint
```

## Rollback Plan
Remover `src/world/` e voltar a OfficeScene ao placeholder.
