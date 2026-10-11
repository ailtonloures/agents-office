---
title: CharacterController — máquina de estados, pathfinding, animações por ferramenta e ciclo de vida
number: 010
priority: high
tags: [feature, web, characters, state-machine, pathfinding]
dependencies: [008-room-layout-generator.spec.md, 009-character-factory.spec.md]
related_prd: ../prds/agents-office.prd.md
status: pending
created: 2026-10-10
---

# 010 - CharacterController e ciclo de vida

## Overview
Liga o modelo aos personagens na cena. O Tech Lead aparece na mesa da sessão. Cada subagente entra pela porta, anda até uma baia livre perto do pai, anima conforme a ferramenta e os balões de status, entrega o relatório ao Tech Lead ao terminar e sai. Sessões ociosas dormem e sessões encerradas saem.

## Related PRD
- **Source**: [Agents Office](../prds/agents-office.prd.md)
- **Section Reference**: User Stories 17-20, 25-37; Implementation Decisions → CharacterController, Estados visuais

## Prerequisites
- [ ] Specs 008 e 009 concluídos

## Dependencies
- `008-...`: desks, doors, pois e collision
- `009-...`: textura e animações dos personagens

## Implementation Tasks
### 1. Máquina de estados visual (`src/characters/characterMachine.ts`, pura)
- [ ] Estados: `entering → walking-to-desk → at-desk(activity) → walking-to-poi → delivering → leaving → gone`; atividade `thinking | typing | reading | terminal | web | summoning | waiting | error | sleeping`
- [ ] `nextVisualState(current, modelActor, layout): VisualIntent` pura e testável
- [ ] Tabela configurável ferramenta → atividade/poi: Edit/Write/NotebookEdit → typing (mesa); Read/Grep/Glob → reading (mesa); Bash → terminal (poi server-rack); WebFetch/WebSearch → web (poi phone/window); Agent → summoning (Tech Lead vai até a porta); `mcp__*` e outras → typing genérico
- [ ] Permanência mínima de ~600 ms por atividade (evitar flicker com tools rápidas); tool que termina enquanto o personagem ainda caminha → volta direto à mesa

### 2. Controller (`src/characters/characterController.ts`)
- [ ] Pathfinding A* no grid de colisão (easystar.js ou implementação própria), movimento tile a tile a ~4 tiles/s como no Pokémon
- [ ] Atribuição de baias: a mais próxima da mesa do pai (Tech Lead ou agente-pai quando `spawnDepth > 1`); atribuição estável; liberação ao sair
- [ ] Balões (sprites 8x8 acima da cabeça): `…` thinking, `!` amarelo waiting (com bounce), gota vermelha error, `Zzz` sleeping
- [ ] Fim do agente: anda até o Tech Lead → `celebrate` curto + ícone de documento → anda até a porta → fade out → remove a textura → registra no Hall da Fama
- [ ] Sessão encerrada: Tech Lead e agentes restantes saem pela porta; a sala é removida quando vazia
- [ ] Fila de movimentos para evitar personagens sobrepostos na porta (espera de 1 tile)
- [ ] Atualizar `window.__office.characters`

### 3. Testing
- [ ] `test/characterMachine.test.ts`: tabela ferramenta → atividade; sequência spawn → work → finish → leaving; permanência mínima; waiting tem prioridade visual sobre thinking
- [ ] `test/deskAssignment.test.ts`: subagente aninhado fica perto do pai; baias não duplicadas; liberação

## Acceptance Criteria
### Must Have
- [ ] Com o daemon rodando contra uma sessão real que dispara 2 subagentes, ambos entram, trabalham, entregam e saem
- [ ] Testes puros passam

### Should Have
- [ ] Tech Lead "chamando" na porta sincronizado com a entrada do novo agente

## Testing Requirements
```bash
pnpm --filter @agents-office/web test characterMachine deskAssignment
pnpm typecheck && pnpm lint
```

## Rollback Plan
Remover `src/characters/characterMachine.ts` e `characterController.ts`; a OfficeScene volta a só desenhar as salas.
