---
title: Landing - SEO, acessibilidade e desempenho
number: 113
priority: medium
tags: [enhancement, landing, seo, a11y, performance]
dependencies: [111-landing-secoes-hero-como-funciona-e-recursos.spec.md, 112-landing-secoes-seguranca-instalacao-e-open-source.spec.md]
related_prd: ../prds/landing-page-comercial.prd.md
status: pending
created: 2026-10-12
---

# 113 - Landing - SEO, acessibilidade e desempenho

## Overview
Metadados, compartilhamento social, dados estruturados, acessibilidade e orçamento de desempenho da landing.

## Related PRD
- **Source**: [Landing page comercial](../prds/landing-page-comercial.prd.md)
- **Section Reference**: User Stories 33-38; Implementation Decisions (SEO, acessibilidade)

## Prerequisites
- [ ] Páginas das specs 111 e 112 completas

## Dependencies
- `111-...` e `112-...` - conteúdo final

## Implementation Tasks
### 1. SEO e compartilhamento
- [ ] `index.html`: título, descrição, canonical (via `SITE_URL`), Open Graph, Twitter Card, `theme-color`, favicons (reuso de `logo.svg`/`favicon`)
- [ ] JSON-LD `SoftwareApplication` (licença MIT, sistemas operacionais, preço 0)
- [ ] `public/robots.txt`, `public/sitemap.xml`, `public/og.png` (1200x630, a partir do screenshot e do logo)
### 2. Acessibilidade
- [ ] Marcos (`header`, `nav`, `main`, `section` com títulos, `footer`), link "pular para o conteúdo", ordem de foco, `aria-live` para "copiado", textos alternativos, `lang` dinâmico
- [ ] Verificar contraste AA e uso só por teclado
### 3. Desempenho
- [ ] Preload da fonte pixel e dos sprites críticos, imagens com dimensões, divisão de código se útil, sem dependências pesadas
- [ ] Meta Lighthouse: 95 ou mais em desempenho, acessibilidade, boas práticas e SEO

## Acceptance Criteria
### Must Have
- [ ] Lighthouse 95+ nas quatro categorias no build de preview
- [ ] Prévia social válida; JSON-LD sem erros
### Should Have
- [ ] Peso total inicial abaixo de 300 KB (sem contar o canvas)

## Testing Requirements
```bash
pnpm --filter @agents-office/landing build && pnpm --filter @agents-office/landing preview
```
Rodar Lighthouse e axe contra o preview.

## Rollback Plan
Reverter `index.html` e os arquivos de `public/` adicionados.
