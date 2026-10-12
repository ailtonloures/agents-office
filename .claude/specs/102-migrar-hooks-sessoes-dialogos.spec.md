---
title: Migrar Hooks, Sessões e diálogos para i18n
number: 102
priority: medium
tags: [refactor, web, ui, i18n, testing]
dependencies: [099-infra-i18n-locale.spec.md]
related_prd: ../prds/locale-seletor-de-idioma.prd.md
status: done
created: 2026-10-12
---

# 102 - Migrar Hooks, Sessões e diálogos para i18n

## Overview
Migra para `t()` os textos do painel de Hooks (e banner), do seletor de projetos/Sessões, dos balões de diálogo e de avisos de atualização, sessões perdidas e abertura externa.

## Related PRD
- **Source**: [Seletor de idioma](../prds/locale-seletor-de-idioma.prd.md)
- **Section Reference**: User Stories 11, 12, 14, 15, 23

## Prerequisites
- [ ] Spec 099 concluída
- [ ] Ler `ui/settingsPanel.ts`, `ui/settingsLogic.ts`, `ui/projectPickerPanel.ts`, `ui/projectPicker.ts`, `ui/dialogContent.ts`, `ui/lostSessions.ts`, `ui/updateLogic.ts`, `ui/externalOpen.ts`

## Dependencies
- `099-infra-i18n-locale.spec.md` - `t()`, `formatDateTime`

## Implementation Tasks
### 1. Hooks
- [ ] `settingsLogic.ts` (`summaryLabel`, `hooksSeenLabel`) e `settingsPanel.ts` com chaves `hooks.*`; data via `formatDateTime`
### 2. Sessões
- [ ] `projectPickerPanel.ts` e `projectPicker.ts` com chaves `picker.*`
### 3. Diálogos e avisos
- [ ] `dialogContent.ts` (`dialog.*`), mantendo truncamento por `DIALOG_COLS` (comprimentos variam por idioma); `lostSessions.ts`, `updateLogic.ts`, `externalOpen.ts`
- [ ] Nomes de perfil e conteúdo de sessão não são traduzidos
### 4. Dicionários e testes
- [ ] Chaves nos três dicionários
- [ ] Ajustar `settingsLogic.test.ts`, `dialogContent.test.ts` e correlatos (fixar `pt-BR` ou afirmar `en`) e cobrir ao menos um caso em `es`

## Acceptance Criteria
### Must Have
- [ ] Sem literais pt-BR restantes nos arquivos listados
- [ ] Testids estáveis; `pnpm typecheck && pnpm lint && pnpm vitest run` sem falhas causadas por esta spec
### Should Have
- [ ] Verificação manual dos painéis nos três idiomas

## Testing Requirements
```bash
pnpm vitest run packages/web/test/settingsLogic.test.ts packages/web/test/dialogContent.test.ts
pnpm typecheck && pnpm lint
```

## Rollback Plan
Reverter os arquivos migrados e as chaves adicionadas.
