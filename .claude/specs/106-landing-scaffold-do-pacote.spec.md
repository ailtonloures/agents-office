---
title: Scaffold do pacote landing (Vite, React 19, Vercel)
number: 106
priority: high
tags: [feature, landing, infra, vercel]
dependencies: []
related_prd: ../prds/landing-page-comercial.prd.md
status: pending
created: 2026-10-12
---

# 106 - Scaffold do pacote landing (Vite, React 19, Vercel)

## Overview
Cria o pacote privado `packages/landing` na mesma toolchain do `packages/web`, com uma página mínima que builda, e o `vercel.json` para publicar a partir do monorepo. É a base das demais specs da landing.

## Related PRD
- **Source**: [Landing page comercial](../prds/landing-page-comercial.prd.md)
- **Section Reference**: User Stories 39, 40; Implementation Decisions (pacote, deploy na Vercel)

## Prerequisites
- [ ] Ler `packages/web/package.json`, `vite.config.ts` e `tsconfig.json` (versões e padrão)
- [ ] Ler `tsconfig.base.json`, `biome.json`, `vitest.workspace.ts` e `pnpm-workspace.yaml`
- [ ] Ler `packages/cli/test/package.test.ts` (não pode ser afetado)

## Dependencies
- Nenhuma

## Implementation Tasks
### 1. Pacote
- [ ] `packages/landing/package.json`: nome `@agents-office/landing`, `private`, `type: module`, versão `0.0.0`; scripts `dev`, `build`, `preview`, `typecheck` (`tsc --noEmit -p tsconfig.json`), `test` (`vitest run --passWithNoTests` se necessário)
- [ ] Dependências com versões exatas: `react` e `react-dom` 19.2.0, `@types/react` e `@types/react-dom` 19.3.0, `vite` 7.3.7, `@vitejs/plugin-react` (versão pinada compatível com Vite 7)
- [ ] `tsconfig.json` estendendo `../../tsconfig.base.json` com `jsx: react-jsx`, `lib` ES2022 + DOM
- [ ] `vite.config.ts` com plugin React, sem `base`
- [ ] `index.html` e `src/main.tsx`/`App.tsx` mínimos (um título renderizado)
### 2. Vercel
- [ ] `packages/landing/vercel.json`: `framework: vite`, `installCommand` com `pnpm install --frozen-lockfile` na raiz, `buildCommand` com `pnpm --filter @agents-office/landing build`, `outputDirectory: dist`
- [ ] Cabeçalhos: cache imutável para `/assets/*`; `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`
### 3. Workspace
- [ ] `pnpm install` atualiza o lockfile; confirmar que `packages/cli` não depende da landing

## Acceptance Criteria
### Must Have
- [ ] `pnpm --filter @agents-office/landing build` gera `dist/index.html`
- [ ] `pnpm typecheck && pnpm lint && pnpm vitest run` sem falhas causadas por esta spec
- [ ] Teste de licenças do cli continua verde
### Should Have
- [ ] Nenhuma dependência com `^` ou `~`

## Testing Requirements
```bash
pnpm install
pnpm --filter @agents-office/landing build
pnpm typecheck && pnpm lint && pnpm vitest run
```

## Rollback Plan
Remover `packages/landing` e restaurar `pnpm-lock.yaml`.
