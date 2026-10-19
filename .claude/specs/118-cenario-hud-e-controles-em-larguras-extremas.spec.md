---
title: Cenário - HUD e controles de canto em larguras extremas
number: 118
priority: medium
tags: [enhancement, web, ui, hud, testing]
dependencies: [116-cenario-pipeline-de-resize-sem-esticar.spec.md]
related_prd: ../prds/cenario-responsivo-terminal-ultrawide.prd.md
status: pending
created: 2026-10-18
---

# 118 - Cenário - HUD e controles de canto em larguras extremas

## Overview
As barras de informação do topo ficam nos cantos e devem seguir a largura real do canvas em qualquer resolução, com o terminal aberto em qualquer doca. Esta spec trava esse comportamento com testes e corrige o que a verificação mostrar.

## Related PRD
- **Source**: [Cenário responsivo](../prds/cenario-responsivo-terminal-ultrawide.prd.md)
- **Section Reference**: User Stories 15 a 19, 26; Implementation Decisions (HUD)

## Prerequisites
- [ ] Spec 116 concluída
- [ ] `pnpm typecheck && pnpm lint && pnpm vitest run` verdes

## Dependencies
- `116-cenario-pipeline-de-resize-sem-esticar.spec.md` - a largura lógica já correta no evento de resize

## Implementation Tasks
### 1. Testes primeiro (Red)
- [ ] `packages/web/test/hudLogic.test.ts`: `hintPanelX` em larguras 256, 480, 853 (5120x1440) e uma estreita após o terminal abrir: painel de atalhos em `largura - margem - largura do painel`, nunca à esquerda da pílula de status
- [ ] Caso em que o painel não cabe: os atalhos são escondidos (regra `x0 <= MARGIN + statusWidth + 8`)
- [ ] Se algum caso já passar, registrar que ele trava um comportamento existente; o que falhar guia a correção

### 2. Correção (Green), só se a verificação mostrar necessidade
- [ ] `packages/web/src/ui/hud.ts` e `hudLogic.ts`: garantir que `layout(width)` recebe a largura lógica atual no evento de resize e que nenhum valor antigo é guardado
- [ ] `packages/web/src/ui/cornerBar.ts`: confirmar `position: absolute` dentro de `#game` (nunca `fixed`), de modo que o terminal não cubra os controles

### 3. Verificação manual
- [ ] Playwright MCP em 1280x720, 1920x1080, 3440x1440 e 5120x1440, com o terminal fechado e aberto em cada doca: pílula de status no canto superior esquerdo, atalhos no canto superior direito da área real do jogo, controles de canto visíveis

## Acceptance Criteria
### Must Have
- [ ] Testes de largura extrema e estreita presentes e verdes
- [ ] Barras e controles de canto sempre dentro da área do jogo, nos cantos esperados
### Should Have
- [ ] Nenhuma mudança de visual ou de texto (sem chaves de i18n novas)

## Testing Requirements
```bash
pnpm vitest run packages/web/test/hudLogic.test.ts
pnpm typecheck && pnpm lint && pnpm vitest run
```

## Rollback Plan
Reverter o commit (`git revert`); os testes adicionados podem ficar.
