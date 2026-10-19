---
title: Cenário - chão estendido para preencher telas ultra wide
number: 117
priority: high
tags: [feature, web, phaser, world, testing]
dependencies: [116-cenario-pipeline-de-resize-sem-esticar.spec.md]
related_prd: ../prds/cenario-responsivo-terminal-ultrawide.prd.md
status: pending
created: 2026-10-18
---

# 117 - Cenário - chão estendido para preencher telas ultra wide

## Overview
O prédio tem 32 a 64 tiles de largura e em telas ultra wide sobra uma faixa escura vazia. Esta spec adiciona um chão/fundo decorativo atrás do prédio, que cobre sempre a visão da câmera, de modo que a tela inteira mostra cenário. O zoom inteiro e a âncora do prédio não mudam.

## Related PRD
- **Source**: [Cenário responsivo](../prds/cenario-responsivo-terminal-ultrawide.prd.md)
- **Section Reference**: User Stories 8 a 14, 25, 30; Implementation Decisions (chão estendido, visão geral, prédio ancorado)

## Prerequisites
- [ ] Spec 116 concluída
- [ ] `pnpm typecheck && pnpm lint && pnpm vitest run` verdes

## Dependencies
- `116-cenario-pipeline-de-resize-sem-esticar.spec.md` - o resize e os limites da câmera já corretos

## Implementation Tasks
### 1. Testes primeiro (Red)
- [ ] `packages/web/test/groundLogic.test.ts`: `groundRect(view, building, margin)` devolve a união do prédio com a visão da câmera mais a margem
- [ ] Casos: visão menor que o prédio (sem extra além da margem), 1920x1080, 3440x1440 (cerca de 573x240 lógicos), 5120x1440 (cerca de 853x240), terminal aberto (visão mais estreita), visão geral (câmera afastada), valores zero ou negativos sem lançar erro
- [ ] Ver os testes falharem antes de implementar

### 2. Lógica pura (Green)
- [ ] `packages/web/src/world/groundLogic.ts`: `groundRect` puro, sem Phaser nem relógio

### 3. Cena
- [ ] `OfficeScene`: criar uma `TileSprite` de chão atrás do prédio (profundidade abaixo da camada de chão), objeto de mundo fora da câmera de interface
- [ ] Atualizar posição e tamanho a partir de `groundRect` em `onResize`, quando o zoom manual muda, na entrada/saída da visão geral e quando o layout muda
- [ ] Tile: reutilizar um tile existente do tileset, escurecido (tint). Se nenhum servir, editar o gerador (`pnpm --filter @agents-office/web generate-skin`), nunca os PNGs, e listar o arquivo novo em `packages/web/public/skins/default/LICENSES.md` (CC0)
- [ ] Manter `setCameraBounds` alargado até a visão e a visão geral removendo os limites e centralizando

### 4. Refactor
- [ ] Remover duplicações e rodar `pnpm format`

## Acceptance Criteria
### Must Have
- [ ] Em 3440x1440 e 5120x1440 não há faixa escura vazia ao lado do prédio, com ou sem terminal aberto
- [ ] O chão nunca cobre prédio, personagens ou interface
- [ ] A visão geral (`M`) centraliza o prédio com o chão ao redor, e o zoom manual não mostra bordas
- [ ] Telas comuns (1280x720, 1366x768, 1920x1080) sem regressão visual
### Should Have
- [ ] O chão acompanha a câmera nas bordas do prédio durante o seguimento suave do avatar

## Testing Requirements
```bash
pnpm vitest run packages/web/test/groundLogic.test.ts
pnpm typecheck && pnpm lint && pnpm vitest run
pnpm --filter @agents-office/web test
```
Se o skin for gerado, o teste do pacote cli de licenças deve continuar verde. Verificação visual com Playwright MCP em 3440x1440 e 5120x1440 (parte Phaser, não coberta por unidade).

## Rollback Plan
Reverter o commit (`git revert`). Se um arquivo de skin foi adicionado, removê-lo junto com a linha em `LICENSES.md`.
