---
title: Migrar HUD, dicas, ajuda e zoom para i18n
number: 101
priority: high
tags: [refactor, web, ui, i18n, testing]
dependencies: [099-infra-i18n-locale.spec.md]
related_prd: ../prds/locale-seletor-de-idioma.prd.md
status: done
created: 2026-10-12
---

# 101 - Migrar HUD, dicas, ajuda e zoom para i18n

## Overview
Troca os textos fixos em pt-BR do HUD, das dicas, do painel de ajuda, dos atalhos e dos controles de zoom por chaves do helper `t()`, com os três dicionários completos para essas áreas.

## Related PRD
- **Source**: [Seletor de idioma](../prds/locale-seletor-de-idioma.prd.md)
- **Section Reference**: User Stories 9, 10, 14, 23, 27

## Prerequisites
- [ ] Spec 099 concluída
- [ ] Ler `ui/hudLogic.ts` (`TIPS`, `hudText`, `promptFor`), `ui/helpPanel.ts`, `ui/keyHints.ts`, `ui/zoomControls.ts`, `ui/promptBar.ts`, `ui/dialogBox.ts`

## Dependencies
- `099-infra-i18n-locale.spec.md` - `t()` e dicionários

## Implementation Tasks
### 1. HUD e dicas
- [ ] `hudLogic.ts`: `TIPS` vira lista de chaves resolvida na chamada (não em tempo de import, para respeitar o idioma inicializado); `hudText`/`promptFor` usam `t()` com interpolação; `now` continua injetado
### 2. Ajuda e atalhos
- [ ] `helpPanel.ts` ('Controles', 'STATUS', 'PAPEIS', legendas) e `keyHints.ts` com chaves `help.*`
### 3. Zoom
- [ ] `zoomControls.ts` ('Aproximar', 'Afastar') com `zoom.*`
### 4. Dicionários
- [ ] Adicionar as chaves em `en.ts`, `pt-BR.ts` (texto original preservado) e `es.ts`
### 5. Testes
- [ ] Ajustar `hudLogic.test.ts`, `zoomControls.test.ts` e correlatos: fixar `setLocale('pt-BR')` no setup para manter as asserções existentes e acrescentar casos em `en` e `es`

## Acceptance Criteria
### Must Have
- [ ] Nenhum literal pt-BR restante nos arquivos listados (exceto dados do usuário)
- [ ] `pnpm typecheck && pnpm lint && pnpm vitest run` sem falhas causadas por esta spec
### Should Have
- [ ] Verificação manual do HUD e da ajuda nos três idiomas

## Testing Requirements
```bash
pnpm vitest run packages/web/test/hudLogic.test.ts packages/web/test/zoomControls.test.ts
pnpm typecheck && pnpm lint
```

## Rollback Plan
Reverter os arquivos migrados e as chaves adicionadas nos dicionários.
