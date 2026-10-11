---
title: Clique no Tech Lead abre o terminal, clique fora minimiza
number: 041
priority: high
tags: [feature, web, desktop, terminal, testing]
dependencies: [040]
related_prd: ../prds/terminal-por-clique-dock-botoes.prd.md
status: pending
created: 2026-10-11
---

# 041 - Clique no Tech Lead abre o terminal, clique fora minimiza

## Overview
Hoje o clique num Tech Lead abre um diálogo e o terminal exige a tecla T. Esta spec introduz uma decisão única de clique: Tech Lead com sessão iniciada no Agents Office abre o terminal direto; Tech Lead externo ou com aba fechada abre o diálogo; qualquer outro alvo minimiza o terminal.

## Related PRD
- **Source**: [Terminal por clique, dock e botões](../prds/terminal-por-clique-dock-botoes.prd.md)
- **Section Reference**: User Stories 1–12, 28; Implementation Decisions (decisão de clique, ponte cena↔painel, foco)

## Prerequisites
- [ ] Spec 040 concluída (`collapse()` no painel)

## Dependencies
- 040 — minimizar painel
- 023 — vínculo aba↔sessão (`terminalId`) e ações desktop

## Implementation Tasks
### 1. Decisão pura
- [ ] Criar função pura (ex.: `decideClick` em `packages/web/src/ui/clickDecision.ts`) com entrada `{target, session, desktop, tabExists, overlayOpen}` e saída `open-terminal | open-dialog | collapse | none`
- [ ] Regras: overlay (diálogo/ajuda) aberto → `none`; TL com `terminalId` e aba existente em desktop → `open-terminal`; TL externo/sem vínculo/aba fechada ou sem desktop → `open-dialog`; demais alvos (vazio, subagente) em desktop → `collapse`; sem desktop → `none` para vazio
### 2. Ponte e cena
- [ ] `packages/web/src/ui/desktopActions.ts`: adicionar `collapseTerminal()` ao contrato
- [ ] `packages/web/src/main.ts`: ligar `collapseTerminal` a `panel.collapse()`
- [ ] `packages/web/src/scenes/OfficeScene.ts` (`onPointer`, `openDialog`): usar `decideClick`; no caso `open-terminal` chamar `openTerminal(terminalId)`; se retornar false, cair em `open-dialog` com o aviso existente de terminal fechado
- [ ] Manter acesso ao diálogo do TL pelo teclado (`onAction`)
### 3. Foco
- [ ] Garantir que, após abrir por clique, o foco termina no xterm mesmo com o `mousedown` do canvas chamando `focusPlayer()` (executar `focusSession` depois, ex.: no handler do Phaser, ou adiar para o próximo frame)
- [ ] Ao minimizar, o teclado volta ao jogo
### 4. Testes
- [ ] Unitário: tabela de casos de `decideClick` (TL interno, TL externo, sem vínculo, aba fechada, subagente, vazio, overlay aberto, sem desktop)
- [ ] E2E (ponte simulada): clique no TL com terminal abre o painel; clique no vazio o minimiza; outro TL troca de aba

## Acceptance Criteria
### Must Have
- [ ] TL interno abre o terminal direto com foco; TL externo só abre diálogo
- [ ] Clique em vazio ou não-TL minimiza; clique com diálogo aberto só fecha o diálogo
- [ ] Sem regressão no navegador comum (sem ponte desktop)
- [ ] `pnpm typecheck`, `pnpm lint`, testes unitários e E2E verdes
### Should Have
- [ ] Comentário desatualizado sobre "avatar anda até o tile clicado" em `zoomControls.ts` corrigido

## Testing Requirements
```bash
pnpm typecheck && pnpm lint && pnpm vitest run
pnpm build && pnpm --filter @agents-office/e2e test
```
Manual no app desktop: iniciar sessão pelo Sessões, clicar no TL (abre terminal), clicar no chão (minimiza), clicar em TL de sessão externa (só diálogo).

## Rollback Plan
Reverter o commit: o clique volta a abrir só o diálogo e o terminal pela tecla T.
