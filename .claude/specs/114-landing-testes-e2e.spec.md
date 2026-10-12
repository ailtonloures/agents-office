---
title: Landing - testes e2e com Playwright
number: 114
priority: medium
tags: [testing, landing, e2e]
dependencies: [113-landing-seo-acessibilidade-e-desempenho.spec.md]
related_prd: ../prds/landing-page-comercial.prd.md
status: pending
created: 2026-10-12
---

# 114 - Landing - testes e2e com Playwright

## Overview
Smoke e2e do build de preview da landing: idiomas, comando copiável, ausência de rolagem horizontal no celular e renderização do hero.

## Related PRD
- **Source**: [Landing page comercial](../prds/landing-page-comercial.prd.md)
- **Section Reference**: Testing Decisions (seam 3); User Stories 29-33

## Prerequisites
- [ ] Ler `e2e/` (config Playwright, `webServer`, specs existentes) e o job de e2e em `.github/workflows/ci.yml`

## Dependencies
- `113-...` - página completa

## Implementation Tasks
### 1. Testes (`e2e/tests/landing.spec.ts`)
- [ ] Servir `packages/landing` via `vite preview` (projeto ou `webServer` próprio, sem afetar os testes existentes)
- [ ] Troca entre EN, PT-BR e ES atualiza título, `html[lang]` e persiste após recarregar
- [ ] Botão de copiar coloca `npx agents-office hooks install` na área de transferência e mostra confirmação
- [ ] Viewport 390px: `scrollWidth <= innerWidth`
- [ ] Hero: canvas presente e com pixels desenhados; com `reducedMotion` o quadro é estático
- [ ] CTAs com os `href` corretos (releases e repositório)
### 2. CI
- [ ] Garantir que o build da landing roda antes dos e2e em `ci.yml` (o `pnpm build` já cobre)

## Acceptance Criteria
### Must Have
- [ ] E2E da landing passa local e na CI
- [ ] Suítes e2e existentes seguem verdes
### Should Have
- [ ] Verificação automática de contraste/axe se já houver dependência no e2e (sem adicionar nova)

## Testing Requirements
```bash
pnpm build && pnpm exec playwright test e2e/tests/landing.spec.ts
```

## Rollback Plan
Remover `e2e/tests/landing.spec.ts` e ajustes de configuração.
