---
title: Parede com profundidade (laje clara, laterais, fachada e reveal)
number: 051
priority: high
tags: [enhancement, web, art, walls, lighting]
dependencies: [050]
related_prd: ../prds/cenario-volume-portas-moveis.prd.md
status: done
created: 2026-10-11
---

# 051 - Parede com profundidade

## Overview
As paredes já têm 3 linhas de altura, mas não mostram espessura. O topo é uma faixa escura de 5 px, igual às laterais, e lê como borda.

Esta spec redesenha a laje como um volume claro e grosso:
- plano iluminado, aresta de luz, face frontal escura e sombra projetada;
- laterais e cantos contínuos;
- a fachada na parede de baixo;
- o reveal no vão da porta.

A spec também reforça o gradiente da face e a sombra no piso.

## Related PRD
- **Source**: [Cenário com volume](../prds/cenario-volume-portas-moveis.prd.md)
- **Section Reference**: User Stories 10–17, 31; Implementation Decisions (Parede)

## Prerequisites
- [ ] Spec 050 concluída. O reveal de `door-back` reaproveita as cores da laje definidas aqui; se 051 for feita antes, revisar as cores de `door-back`.

## Dependencies
- 050 — Porta atravessável (o reveal e a parede acima da verga usam `faceColor`)

## Implementation Tasks
### 1. Laje superior (`packages/web/scripts/skin/tiles.mjs`, `faceColor`)
- [ ] Laje de 8 px (v 0–7) em cinza quente claro, no lugar do `capTop` ardósia:
  - v0: linha escura de 1 px (borda de trás, separa do piso do corredor);
  - v1–4: plano de topo com speckle leve;
  - v5: aresta frontal clara;
  - v6–7: face frontal da laje mais escura.
- [ ] Logo abaixo, um gradiente de 4 px da sombra da laje sobre o reboco.
- [ ] Ajustar `RAIL`, `SKIRT` e as faixas para os 48 px continuarem coerentes. Novas constantes nomeadas para as cores da laje (`SLAB_*`).
- [ ] Face com gradiente vertical mais marcado (claro no alto, escurecendo para o lambri) e AO de 3 px acima do rodapé e no encontro com o piso.

### 2. Laterais e cantos (`sideBand`, `corner`)
- [ ] Banda de 8 px no material da laje:
  - aresta de luz de 1 px do lado esquerdo (luz vem de cima à esquerda);
  - face de sombra de 1–2 px do lado direito;
  - borda externa escura.
- [ ] Cantos `wall-corner-tl/tr`: a laje lateral emenda na de cima, sem a linha de aresta frontal atravessando a banda. O topo fica contínuo.
- [ ] AO no piso ao lado da banda (manter o gradiente transparente).

### 3. Parede de baixo (`wall-bottom`) e `wall-cap`
- [ ] Laje clara de 8 px mais uma fachada externa de 8 px com junta vertical e linha de base.
- [ ] `wall-cap` no mesmo material, para skins/fallbacks.

### 4. Iluminação (`packages/web/src/world/lighting.ts`)
- [ ] `WALL_SHADOW` com 6 linhas (ex.: `[0.32, 0.2, 0.12, 0.07, 0.035, 0.015]`).
- [ ] Conferir a luz da janela e os pools de teto com a laje nova.

### 5. Porta (cores)
- [ ] Conferir que a parede acima da verga e o reveal de `door-back` (spec 050) casam pixel a pixel com os tiles novos.

### 6. Learning
- [ ] Atualizar `.claude/learnings/office-visuals.md` com a anatomia da laje (linhas v e cores) e o motivo: um topo escuro lê como borda, um topo claro com aresta lê como volume.

## Acceptance Criteria
### Must Have
- [ ] No corredor e na entrada da sala, a laje do topo e as laterais leem como volume: plano claro, aresta de luz, face escura e sombra abaixo
- [ ] Os cantos têm laje contínua; a parede de baixo mostra a fachada
- [ ] A parede acima da porta e o reveal casam com os tiles vizinhos
- [ ] Skins antigas continuam carregando (`skin.test`)
- [ ] `pnpm test`, `pnpm typecheck` e `pnpm lint` passam; E2E passa

### Should Have
- [ ] Screenshots antes/depois do corredor e da entrada enviados para validação

## Testing Requirements
```bash
pnpm --filter @agents-office/web generate-skin
npx biome format --write packages/web/public/skins/default/skin.json
pnpm test && pnpm typecheck && pnpm lint
pnpm --filter @agents-office/web build && pnpm --filter @agents-office/e2e test
```

## Rollback Plan
- Reverter `tiles.mjs` e `lighting.ts` e regenerar a skin. Layout e colisão não mudam nesta spec.
