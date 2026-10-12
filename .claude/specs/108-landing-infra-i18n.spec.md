---
title: Landing - infraestrutura de i18n (en, pt-BR, es)
number: 108
priority: high
tags: [feature, landing, i18n, testing]
dependencies: [106-landing-scaffold-do-pacote.spec.md]
related_prd: ../prds/landing-page-comercial.prd.md
status: pending
created: 2026-10-12
---

# 108 - Landing - infraestrutura de i18n (en, pt-BR, es)

## Overview
Dicionários tipados e provider React para a landing, no mesmo modelo do `packages/web`: inglês é a fonte das chaves, português e espanhol são tipados contra ela. Inclui seletor de idioma.

## Related PRD
- **Source**: [Landing page comercial](../prds/landing-page-comercial.prd.md)
- **Section Reference**: User Stories 29-32, 41; Implementation Decisions (internacionalização)

## Prerequisites
- [ ] Ler `packages/web/src/i18n/{locale,i18n}.ts` e `messages/en.ts`
- [ ] Ler `packages/web/test/locale.test.ts` e `i18n.test.ts`

## Dependencies
- `106-landing-scaffold-do-pacote.spec.md` - pacote

## Implementation Tasks
### 1. Lógica pura (`src/i18n/locale.ts`)
- [ ] `Locale`, `DEFAULT_LOCALE = 'en'`, chave de storage própria da landing, `LOCALES`, `parseLocale`
- [ ] `detectLocale(navigatorLanguages)` (pt* → pt-BR, es* → es, resto → en)
- [ ] `readStoredLocale`/`writeStoredLocale` com try/catch
### 2. Dicionários (`src/i18n/messages/`)
- [ ] `en.ts` (fonte, chaves por seção: `nav.*`, `hero.*`, `how.*`, `features.*`, `arch.*`, `security.*`, `install.*`, `oss.*`, `footer.*`), `pt-BR.ts` e `es.ts` tipados como `Messages`
- [ ] Usar os mesmos termos da app em português (Elenco, Quadro, Sessões)
### 3. Provider e hook (`src/i18n/i18n.tsx`)
- [ ] `I18nProvider`, `useI18n()` com `t(key, params)` (interpolação `{nome}`, fallback en, depois chave), `locale`, `setLocale`
- [ ] Atualizar `document.documentElement.lang` ao trocar
- [ ] Componente `LangSwitch` (EN/PT/ES, nome nativo no menu, acessível por teclado)
### 4. Testes (`test/i18n.test.ts`)
- [ ] Paridade de chaves, strings não vazias, interpolação, fallback, detecção, storage que lança

## Acceptance Criteria
### Must Have
- [ ] Chave faltando em pt-BR ou es quebra o typecheck
- [ ] Idioma inicial vem do navegador; escolha persiste; storage bloqueado não lança
### Should Have
- [ ] Troca de idioma sem recarregar a página

## Testing Requirements
```bash
pnpm vitest run packages/landing/test/i18n.test.ts
pnpm typecheck && pnpm lint
```

## Rollback Plan
Reverter `src/i18n` e `test/i18n.test.ts`.
