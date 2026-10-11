---
title: Porta atravessável em duas camadas e timing de abertura
number: 050
priority: high
tags: [enhancement, web, world, art, doors, testing]
dependencies: [008]
related_prd: ../prds/cenario-volume-portas-moveis.prd.md
status: done
created: 2026-10-11
---

# 050 - Porta atravessável em duas camadas e timing de abertura

## Overview
Hoje a porta é uma imagem só, com depth `wallProps` (2.5). Os personagens (depth 4+) passam sempre por cima dela.

Esta spec divide a porta em duas camadas:
- **Fundo:** o vão e o reveal (a espessura da parede vista pelo vão).
- **Frente:** a parede acima da verga, a verga, as ombreiras e o vidro semitransparente. Ela é ordenada com os personagens pela linha do piso da parede.

Assim o avatar passa por dentro do batente. A spec também encurta a animação, para que a porta já esteja aberta quando alguém chega ao vão.

## Related PRD
- **Source**: [Cenário com volume](../prds/cenario-volume-portas-moveis.prd.md)
- **Section Reference**: User Stories 1–9, 30, 34, 35; Implementation Decisions (Porta em duas camadas, Timing da porta)

## Prerequisites
- [ ] Rodada 1 no código: paredes de 3 linhas (`WALL_ROWS`), `src/world/doors.ts` (`DoorAnimator`, `stepDoor`, `doorShouldOpen`), frames `door-0..5` no atlas de props e `window.__office.doors`

## Dependencies
- 008 — RoomLayoutGenerator (portas em `layout.doors`)

## Implementation Tasks
### 1. Arte (`packages/web/scripts/skin/props.mjs`, função `door()` e `DOOR_PROPS`)
- [ ] Novo frame `door-back` com o mesmo tamanho dos frames de porta (24x48, âncora `ax=4`, `ay=48`):
  - vão em gradiente escuro (o corredor visto pela porta);
  - reveal de 2–3 px nas laterais internas e na face de baixo da verga, com as cores da laje de `faceColor` (`tiles.mjs`).
- [ ] Frames de frente `door-0..5`:
  - parede acima da verga, verga, ombreiras e soleira opacas;
  - vão transparente;
  - folhas de vidro com alpha ~0.55 (`#rrggbbaa` no `px`/`rect`) e caixilho e puxador opacos.
  - Sem outline (`noOutline`).
- [ ] Conferir que, no frame aberto, as folhas ficam totalmente escondidas nas ombreiras e pockets.

### 2. Cena (`packages/web/src/world/doors.ts`)
- [ ] `Slot` com duas imagens:
  - `back` em `depth` (`DEPTH.wallProps`);
  - `front` em `4 + (base + 0.5) / 10_000`, com `base = (door.tile.y + 1) * 16`. É a mesma fórmula de `SPRITE_DEPTH + py/10000` em `characterController.ts`.
- [ ] `DoorAnimator.frameCount`:
  - exige ≥2 frames `door-N`;
  - novo `hasBack(frames)` indica se existe `door-back`.
  - Sem `door-back`: uma camada só, como hoje, com `front` em `wallProps`.
- [ ] `update` troca só o frame da `front`. `sync` reposiciona e destrói as duas imagens.
- [ ] Constantes: `DOOR_FRAME_MS ≈ 40`. Manter `NEAR_X = 1` e `NEAR_Y = 2`. Ajustar se a simulação da tarefa 3 exigir.

### 3. Testes (`packages/web/test/doors.test.ts`)
- [ ] Simulação de travessia:
  - o jogador anda de `door.outside` até `door.tile.y + 2` a 200 ms por tile (`PLAYER_STEP_MS`), com interpolação de posição em passos de 16 ms;
  - em todo instante em que a posição está dentro das linhas do vão, `stepDoor(...).frame === frames - 1`.
- [ ] Mesma simulação no sentido inverso (saindo da sala).
- [ ] NPC a 4 tiles/s (`STEP_MS` do controller): também atravessa com a porta aberta.
- [ ] `frameCount`/`hasBack` com e sem `door-back`.

### 4. E2E (`e2e/tests/office.spec.ts`)
- [ ] Novo teste:
  - `approachDoor(room)`;
  - segurar `ArrowDown` até o jogador estar dentro da sala: `doors[room]` vira `open`;
  - voltar para o corredor e se afastar: `doors[room]` vira `closed`.

### 5. Learning
- [ ] Atualizar a seção "Tall walls + automatic doors" de `.claude/learnings/office-visuals.md`: duas camadas, depth da frente e por que o timing depende do passo do jogador.

## Acceptance Criteria
### Must Have
- [ ] Ao entrar ou sair de uma sala, o avatar aparece atrás da verga e das ombreiras enquanto está nas linhas da parede, e na frente da parede assim que pisa na sala
- [ ] O vidro aparece semitransparente por cima do avatar enquanto desliza
- [ ] Ninguém (jogador ou NPC) atravessa o vidro fechado (teste de simulação)
- [ ] A porta fecha depois que todos se afastam e reabre se alguém volta
- [ ] Skins sem `door-back`, ou sem frames de porta, continuam funcionando
- [ ] `pnpm test`, `pnpm typecheck` e `pnpm lint` passam

### Should Have
- [ ] Screenshot no meio da travessia enviado para validação visual

## Testing Requirements
```bash
pnpm --filter @agents-office/web generate-skin
npx biome format --write packages/web/public/skins/default/skin.json
pnpm --filter @agents-office/web test -- doors
pnpm typecheck && pnpm lint
pnpm --filter @agents-office/web build && pnpm --filter @agents-office/e2e test
```

## Rollback Plan
- Remover o frame `door-back` do gerador e regenerar a skin. O `DoorAnimator` volta automaticamente à camada única.
- Para voltar o timing, restaurar `DOOR_FRAME_MS = 50`.
