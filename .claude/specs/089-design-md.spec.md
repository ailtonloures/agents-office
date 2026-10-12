---
title: DESIGN.md com design, layout e jogo
number: 089
priority: medium
tags: [docs, design, game, web]
dependencies: []
related_prd: ../prds/documentacao-do-projeto.prd.md
status: pending
created: 2026-10-12
---

# 089 - DESIGN.md com design, layout e jogo

## Overview
Documento na raiz, em inglês, sobre o design visual e o jogo em Phaser: viewport, layout procedural, personagens, skin e convenções de UI.

## Related PRD
- **Source**: [Documentação dedicada](../prds/documentacao-do-projeto.prd.md)
- **Section Reference**: User Stories 15-18

## Prerequisites
- [ ] Ler `packages/web/src` (scenes, world, characters, ui, skin) e os learnings `office-visuals`, `office-zoom`, `player-dialog-hud`, `canvas-resize-flash`

## Dependencies
- Nenhuma

## Implementation Tasks
### 1. DESIGN.md
- [ ] Viewport e zoom inteiro (`scale.ts`, `zoom.ts`), eventos de zoom e `UiOverlay`
- [ ] Layout procedural (`world/roomLayout.ts`): chunks de 16 tiles, tipos de chunk, linhas de parede, placa do projeto
- [ ] Props, portas em duas camadas, tapetes, iluminação sem shaders, monitores vivos
- [ ] Personagens: atividades e fases da máquina de estados, aparência por hash, acessórios por profissão, balões, atribuição de mesas, visitas
- [ ] Regra de design: trabalhadores não saem da mesa enquanto trabalham
- [ ] Destaque do Tech Lead da aba aberta e contorno de hover
- [ ] Fórmulas de profundidade (z-order)
- [ ] Skin: gerador, schema, tiles obrigatórios e opcionais, luz do canto superior esquerdo, regra de LICENSES.md
- [ ] UI: botões, painéis, tags de nome, HUD, controles, dock do terminal, painel Elenco, quadro
- [ ] Navegador embutido marcado como planejado (specs 080-085)
### 2. Verificação
- [ ] Cada módulo citado existe; sem números de linha

## Acceptance Criteria
### Must Have
- [ ] Um designer entende como alterar layout ou skin sem editar PNGs gerados
- [ ] Constantes citadas batem com o código
### Should Have
- [ ] Tabelas para tipos de chunk, atividades e fases

## Testing Requirements
```bash
pnpm typecheck && pnpm lint && pnpm vitest run
```

## Rollback Plan
Reverter o commit desta spec.
