---
title: Infraestrutura de i18n (locale, dicionários e helper t)
number: 099
priority: high
tags: [feature, web, i18n, testing]
dependencies: []
related_prd: ../prds/locale-seletor-de-idioma.prd.md
status: done
created: 2026-10-12
---

# 099 - Infraestrutura de i18n (locale, dicionários e helper t)

## Overview
Cria o núcleo de tradução do `packages/web`: tipo `Locale`, persistência da escolha, dicionários tipados (en, pt-BR, es), helper `t()` com interpolação e fallback, e formatação de data por idioma. É a base de todas as specs seguintes.

## Related PRD
- **Source**: [Seletor de idioma](../prds/locale-seletor-de-idioma.prd.md)
- **Section Reference**: User Stories 2, 7, 15-18, 24-26; Implementation Decisions (idiomas, persistência, helper, dicionários, datas, atributo lang)

## Prerequisites
- [ ] Ler `packages/web/src/zoom.ts` (padrão de `readStoredZoom`/`writeStoredZoom`) e `packages/web/test/zoom.test.ts` (`stubStorage`)
- [ ] Ler `packages/web/index.html` e `packages/web/src/main.ts`
- [ ] Ler `settingsLogic.ts:50` e `castLogic.ts:369` (datas com `'pt-BR'` fixo)

## Dependencies
- Nenhuma

## Implementation Tasks
### 1. Lógica pura (`packages/web/src/i18n/locale.ts`)
- [ ] `export type Locale = 'en' | 'pt-BR' | 'es'`; `DEFAULT_LOCALE = 'en'`; `LOCALE_STORAGE_KEY = 'agents-office.locale'`
- [ ] `LOCALES: readonly { code: Locale; short: string; label: string }[]` (EN/English, PT/Português, ES/Español; nome nativo)
- [ ] `parseLocale(value: unknown): Locale` (inválido → padrão)
- [ ] `readStoredLocale()` e `writeStoredLocale(locale)` com try/catch (armazenamento indisponível não pode lançar)
### 2. Dicionários (`packages/web/src/i18n/messages/`)
- [ ] `en.ts` exporta o objeto `en` e `type Messages = typeof en` (fonte de verdade das chaves; começa com as chaves do botão de idioma e `common.*`)
- [ ] `pt-BR.ts` e `es.ts` tipados como `Messages` (chave faltando quebra o typecheck)
- [ ] Chaves em notação por ponto agrupadas por área (`hud.*`, `help.*`, `hooks.*`, ...); documentar a convenção no topo de `en.ts`
### 3. Helper (`packages/web/src/i18n/i18n.ts`)
- [ ] `initLocale(): Locale` (lê o armazenado e fixa o ativo), `getLocale()`, `setLocale(locale)` (só em memória, usado por testes)
- [ ] `t(key, params?)`: texto do idioma ativo, interpolação `{nome}`, fallback para inglês, depois para a própria chave
- [ ] `formatDateTime(date, options?)` via `toLocaleString(getLocale(), ...)`
- [ ] Sem leitura de relógio nem de DOM neste módulo
### 4. Integração mínima
- [ ] `main.ts`: chamar `initLocale()` antes de montar qualquer painel e definir `document.documentElement.lang`
- [ ] `index.html`: trocar `lang="pt-BR"` por `lang="en"`
- [ ] Trocar os dois `'pt-BR'` fixos de data por `formatDateTime`
### 5. Testes (`packages/web/test/locale.test.ts`, `i18n.test.ts`)
- [ ] Locale: padrão `en`; valor válido; inválido; `localStorage` que lança; escrita persiste
- [ ] i18n: interpolação, fallback para en, fallback para a chave, paridade de chaves entre os três dicionários (todas as chaves de `en` existem e são strings não vazias em pt-BR e es), `formatDateTime` por idioma

## Acceptance Criteria
### Must Have
- [ ] Sem escolha salva, `getLocale()` é `en`
- [ ] Remover uma chave de `pt-BR.ts` ou `es.ts` quebra o `pnpm typecheck`
- [ ] Armazenamento bloqueado ou corrompido não lança e cai em `en`
- [ ] `pnpm typecheck && pnpm lint && pnpm vitest run` sem falhas causadas por esta spec
### Should Have
- [ ] Módulos puros, sem importar Phaser

## Testing Requirements
```bash
pnpm vitest run packages/web/test/locale.test.ts packages/web/test/i18n.test.ts
pnpm typecheck && pnpm lint
```

## Rollback Plan
Reverter `src/i18n/`, `index.html`, `main.ts` e os dois usos de `formatDateTime`; nenhum dado persistente fora da chave `agents-office.locale`.
