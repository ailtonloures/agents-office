---
title: Migrar painel Elenco para i18n
number: 103
priority: medium
tags: [refactor, web, ui, i18n, cast, testing]
dependencies: [099-infra-i18n-locale.spec.md]
related_prd: ../prds/locale-seletor-de-idioma.prd.md
status: done
created: 2026-10-12
---

# 103 - Migrar painel Elenco para i18n

## Overview
O painel Elenco é o maior consumidor de texto (~130 strings entre `castPanel.ts` e `castLogic.ts`). Migra rótulos, editor de perfis, mensagens (`Perfil "x" salvo`, erros) e a data para `t()`.

## Related PRD
- **Source**: [Seletor de idioma](../prds/locale-seletor-de-idioma.prd.md)
- **Section Reference**: User Stories 11, 14, 15, 23

## Prerequisites
- [ ] Spec 099 concluída
- [ ] Ler `ui/castPanel.ts` e `ui/castLogic.ts`; `shared/src/professions.ts` (rótulos de profissão exibidos)

## Dependencies
- `099-infra-i18n-locale.spec.md` - `t()`, `formatDateTime`

## Implementation Tasks
### 1. Lógica (`castLogic.ts`)
- [ ] Rótulos e mensagens puras via `t()`; data em `formatDateTime`
### 2. Painel (`castPanel.ts`)
- [ ] Todos os literais via chaves `cast.*` (títulos, botões, placeholders, confirmações, mensagens de erro e sucesso, tooltip do botão `cast-open`)
### 3. Profissões e permissões
- [ ] Rótulos de profissão/permissão do `shared` mapeados por id para chaves `profession.*`/`permission.*` no web (o `shared` não depende de idioma)
### 4. Dicionários e testes
- [ ] Chaves nos três dicionários
- [ ] Ajustar `castLogic.test.ts` (fixar `pt-BR` ou afirmar `en`) e cobrir `es`

## Acceptance Criteria
### Must Have
- [ ] Sem literais pt-BR restantes nos arquivos listados (exceto nomes dados pelo usuário)
- [ ] `pnpm typecheck && pnpm lint && pnpm vitest run` sem falhas causadas por esta spec
### Should Have
- [ ] Criar, editar e excluir um perfil no app, nos três idiomas

## Testing Requirements
```bash
pnpm vitest run packages/web/test/castLogic.test.ts
pnpm typecheck && pnpm lint
```

## Rollback Plan
Reverter `castPanel.ts`, `castLogic.ts` e as chaves adicionadas.
