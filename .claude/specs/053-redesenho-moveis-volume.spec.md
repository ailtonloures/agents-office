---
title: Redesenho dos móveis com volume
number: 053
priority: high
tags: [enhancement, web, art, props, lighting]
dependencies: [051, 052]
related_prd: ../prds/cenario-volume-portas-moveis.prd.md
status: done
created: 2026-10-11
---

# 053 - Redesenho dos móveis com volume

## Overview
Os 27 props do atlas são redesenhados com os helpers da 052:
- topo claro, frente com gradiente, aresta de luz e lado de sombra;
- tampos com espessura e pés com sombra;
- materiais com mais contraste e detalhes.

Footprints, colisão, âncoras e o viés de profundidade continuam iguais, então o layout e os personagens não mudam.

## Related PRD
- **Source**: [Cenário com volume](../prds/cenario-volume-portas-moveis.prd.md)
- **Section Reference**: User Stories 18–29; Implementation Decisions (Móveis, Sombra projetada, Atlas)

## Prerequisites
- [ ] 052 concluída (helpers, contraste e preview)
- [ ] 051 concluída (cores da laje e sombra, para os props de parede casarem com a parede)

## Dependencies
- 051 — Parede com profundidade
- 052 — Helpers de volume e contraste

## Implementation Tasks
### 1. Mesas de trabalho (`packages/web/scripts/skin/props.mjs`)
- [ ] `workstation(0..2)` e `leadDesk`:
  - tampo `slab` com 3 px de espessura;
  - gaveteiro `box` com puxadores;
  - pés metálicos `legs`;
  - divisória com topo visível;
  - monitores com moldura e base com volume;
  - cabos;
  - objetos (caneca, teclado, luminária) com sombra própria.
- [ ] Manter os retângulos `screens` (o `deskScreens.ts` desenha neles) e o monitor principal centrado sobre o assento.

### 2. Cadeiras
- [ ] `chair` e `chairExec`: assento com espessura, encosto com volume, base em estrela com rodízios.
- [ ] Manter o `depthBias` e a leitura "cadeira na frente das costas do sentado".

### 3. Armazenamento
- [ ] `bookshelf` e `kanban`:
  - laterais com espessura;
  - prateleiras com aresta clara;
  - livros com topo visível, alguns inclinados;
  - objetos variados.

### 4. Estar
- [ ] `sofa`/`armchair`: braços como blocos (topo + frente), almofadas com volume e vinco, pés.
- [ ] `coffee-table`/`side-table`/`phone-table`: `slab` + `legs`.
- [ ] `floor-lamp`: cúpula com topo elíptico e base com volume. Manter a âncora do brilho (`OFFSETS.props.lamp`).

### 5. Equipamentos
- [ ] `server-rack`, `fridge`, `cooler`, `printer` em `box`:
  - topo, frente e lado de sombra;
  - LEDs, grelhas, garrafão translúcido, bandeja de papel.

### 6. Bancadas
- [ ] `kitchen` e `reception`:
  - tampo saliente com sombra embaixo;
  - frente ripada com volume;
  - objetos em cima.
- [ ] Manter a âncora do vapor do café (`OFFSETS.props.steam`).

### 7. Plantas
- [ ] `plant`, `plant-tall`, `plant-fig`, `planter`:
  - vaso com boca elíptica e terra visível;
  - corpo com gradiente;
  - folhas com mais variação de tom.

### 8. Props de parede
- [ ] `whiteboard`, `tv`, `art-wide`: moldura com espessura e sombra projetada na parede (1–2 px abaixo e à direita), com as cores da face da 051.

### 9. Integração
- [ ] Frames podem crescer em altura (a âncora é a base). Conferir `PROP_DEFS` (largura) e `props.frames` regenerados.
- [ ] Ajustar `OFFSETS.props` em `packages/web/src/world/lighting.ts` se monitor, abajur ou vapor mudarem de posição.
- [ ] Iterar com o preview da 052 antes de abrir o app. Depois, screenshots do lobby, da sala de leads, dos cubículos e das utilidades em `?demo`.

### 10. Learning
- [ ] Atualizar a seção Props de `.claude/learnings/office-visuals.md` com a linguagem de volume (planos, aresta, sombra) e os helpers.

## Acceptance Criteria
### Must Have
- [ ] Todos os 27 props redesenhados com topo, frente e sombra legíveis ao lado dos personagens
- [ ] Monitores animados, brilho de abajur, glow de monitor e vapor do café nos lugares certos
- [ ] Personagem sentado continua com a cadeira cobrindo as costas e o monitor visível
- [ ] Layout, colisão e ids de mesa inalterados (`roomLayout.test`)
- [ ] `pnpm test`, `pnpm typecheck`, `pnpm lint` e E2E passam

### Should Have
- [ ] Screenshots antes/depois por ambiente enviados para validação

## Testing Requirements
```bash
node packages/web/scripts/skin/preview-props.mjs /tmp/preview-props.png
pnpm --filter @agents-office/web generate-skin
npx biome format --write packages/web/public/skins/default/skin.json
pnpm test && pnpm typecheck && pnpm lint
pnpm --filter @agents-office/web build && pnpm --filter @agents-office/e2e test
```

## Rollback Plan
- Reverter `props.mjs` (e `lighting.ts`, se mudou) e regenerar a skin. O formato do atlas é o mesmo, então nada mais muda.
