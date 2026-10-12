---
title: i18n - testes e2e, regra no CLAUDE.md e documentação
number: 105
priority: medium
tags: [docs, testing, e2e, i18n]
dependencies: [100-botao-de-idioma.spec.md, 101-migrar-hud-ajuda-zoom.spec.md, 102-migrar-hooks-sessoes-dialogos.spec.md, 103-migrar-elenco.spec.md, 104-migrar-terminal-browser-quadro-misc.spec.md]
related_prd: ../prds/locale-seletor-de-idioma.prd.md
status: done
created: 2026-10-12
---

# 105 - i18n - testes e2e, regra no CLAUDE.md e documentação

## Overview
Fecha a feature: estabiliza os testes e2e que casam por texto, cobre a troca de idioma ponta a ponta e atualiza as regras e a documentação do projeto.

## Related PRD
- **Source**: [Seletor de idioma](../prds/locale-seletor-de-idioma.prd.md)
- **Section Reference**: User Stories 27, 28; Testing Decisions

## Prerequisites
- [ ] Specs 100 a 104 concluídas
- [ ] Ler `e2e/tests/office.spec.ts`, `permissions.spec.ts`, `e2e/desktop/desktop.spec.ts`

## Dependencies
- `100` a `104` - botão e migração completa

## Implementation Tasks
### 1. E2E
- [ ] Fixar o idioma nos specs existentes (script de init gravando `agents-office.locale` no `localStorage`) ou ajustar os textos para inglês
- [ ] Caso novo: abre em EN; troca para PT e ES; recarrega e confere persistência e ausência de texto de outro idioma nos painéis Hooks, Sessões e Elenco
### 2. Regras e docs
- [ ] `CLAUDE.md`: trocar "App UI strings are pt-BR" por "UI strings go through `t()`; default is English; every key must exist in en, pt-BR and es"
- [ ] `DESIGN.md`: botão de idioma na barra do canto e convenção de chaves; `ARCHITECTURE.md` se citar idiomas ou persistência
- [ ] Learning `.claude/learnings/i18n-locale.md` (pt-BR): decisões (reload, `localStorage`, tipos dos dicionários, fallback) e armadilhas (texto resolvido em tempo de import)
- [ ] `.claude/specs/INDEX.md` com status final

## Acceptance Criteria
### Must Have
- [ ] `pnpm typecheck && pnpm lint && pnpm vitest run` e e2e do office verdes
- [ ] Regra do `CLAUDE.md` atualizada
### Should Have
- [ ] Verificação manual no app desktop empacotado nos três idiomas

## Testing Requirements
```bash
pnpm build && pnpm exec playwright test
pnpm typecheck && pnpm lint && pnpm vitest run
```

## Rollback Plan
Reverter alterações em e2e e documentos; as specs anteriores permanecem independentes.
