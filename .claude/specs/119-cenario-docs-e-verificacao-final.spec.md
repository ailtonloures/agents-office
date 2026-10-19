---
title: Cenário - documentação e verificação final em várias resoluções
number: 119
priority: medium
tags: [docs, web, qa, testing]
dependencies: [116-cenario-pipeline-de-resize-sem-esticar.spec.md, 117-cenario-chao-estendido-em-ultra-wide.spec.md, 118-cenario-hud-e-controles-em-larguras-extremas.spec.md]
related_prd: ../prds/cenario-responsivo-terminal-ultrawide.prd.md
status: pending
created: 2026-10-18
---

# 119 - Cenário - documentação e verificação final em várias resoluções

## Overview
Fecha o PRD: atualiza a documentação do viewport, registra os aprendizados e roda a matriz final de resoluções e docas com o app real.

## Related PRD
- **Source**: [Cenário responsivo](../prds/cenario-responsivo-terminal-ultrawide.prd.md)
- **Section Reference**: User Stories 21 a 23, 27, 28; Testing Decisions; Further Notes

## Prerequisites
- [ ] Specs 116, 117 e 118 concluídas
- [ ] `pnpm typecheck && pnpm lint && pnpm vitest run` verdes

## Dependencies
- `116-...`, `117-...` e `118-...`

## Implementation Tasks
### 1. Documentação
- [ ] `DESIGN.md` seção 1.1: ordem do resize (tamanho, zoom, estilo do canvas), resize síncrono vindo do terminal, chão estendido em telas largas; corrigir o trecho "fica preso à esquerda"
- [ ] `.claude/learnings/canvas-resize-flash.md`: confirmar que a causa e a correção da spec 116 estão registradas; criar outro learning só se o tema for novo (chão estendido)
- [ ] `.claude/specs/INDEX.md`: marcar 116 a 119 como `done` ao concluir

### 2. Verificação final com Playwright MCP
- [ ] Matriz: 1280x720, 1366x768, 1920x1080, 3440x1440 e 5120x1440, com devicePixelRatio 1 e 2 quando possível
- [ ] Para cada uma: terminal fechado, aberto nas docas embaixo, esquerda e direita, recolhido, arrastado e fechado; captura imediata e 1 s depois (devem ser idênticas, sem esticar)
- [ ] Visão geral (`M`), zoom manual e HUD nos cantos
- [ ] Rodar os e2e existentes que tocam o terminal (`pnpm build` antes)

### 3. Commit
- [ ] `:bug:`/`:sparkles:` + mensagem em inglês com o número da spec, apenas se o usuário pedir commit (o teste vai junto com o código)

## Acceptance Criteria
### Must Have
- [ ] Documentação atualizada e coerente com o código
- [ ] Matriz de resoluções e docas sem esticar e sem faixa vazia
- [ ] `pnpm typecheck && pnpm lint && pnpm vitest run` verdes e e2e do terminal passando
### Should Have
- [ ] Prints da matriz guardados fora do repositório (escopo da sessão), citados na entrega

## Testing Requirements
```bash
pnpm typecheck && pnpm lint && pnpm vitest run
pnpm build
```

## Rollback Plan
Reverter os docs (`git revert`); o código das specs 116 a 118 tem rollback próprio.
