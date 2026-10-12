---
title: Landing - tokens, estilos globais e componentes base pixel art
number: 107
priority: high
tags: [feature, landing, ui, design]
dependencies: [106-landing-scaffold-do-pacote.spec.md]
related_prd: ../prds/landing-page-comercial.prd.md
status: pending
created: 2026-10-12
---

# 107 - Landing - tokens, estilos globais e componentes base pixel art

## Overview
Traduz a identidade visual da app (navy, dourado, botões em relevo, painéis pixel art) em tokens CSS e componentes base reutilizados por todas as seções.

## Related PRD
- **Source**: [Landing page comercial](../prds/landing-page-comercial.prd.md)
- **Section Reference**: Implementation Decisions (tokens, botões, tipografia); User Stories 33-35

## Prerequisites
- [ ] Ler `DESIGN.md`, `packages/web/src/ui/buttonStyles.ts` e o CSS do splash em `packages/web/index.html`
- [ ] Escolher a fonte pixel (VT323 ou Press Start 2P, licença OFL) e conferir a licença

## Dependencies
- `106-landing-scaffold-do-pacote.spec.md` - pacote e build

## Implementation Tasks
### 1. Tokens e estilos (`src/styles/`)
- [ ] `tokens.css`: fundo `#0d1020`, radial `#1a1e3a`, painéis `#2a2d44`/`#1b1d2a`, ouro `#f0c040`, creme `#f0e6b8`, texto `#eeecf6`/`#a9a6c4`, foco `#9ad1ff`, brilho violeta; cores de papel (Tech Lead, Analyst, Architect, Developer, QA, Support); escala de espaçamento e larguras
- [ ] `global.css`: reset, `body` com fundo explícito, `image-rendering: pixelated` nas imagens pixel, `prefers-reduced-motion`, foco visível, `scroll-behavior`
- [ ] Fonte pixel self-hosted em `public/fonts/` (somente títulos curtos), com `font-display: swap` e licença registrada
### 2. Componentes (`src/components/`)
- [ ] `PixelButton` (variantes primário/secundário, como `<a>` ou `<button>`; borda 2px dourada, sombra `0 3px 0 #000a`, `:active` desloca 3px)
- [ ] `PixelPanel` (cantos cortados, linha de brilho superior, sombra deslocada; acento por papel)
- [ ] `SectionHeading`, `RoleBadge`, `DesktopBadge` (selo "Desktop") e `BetaBadge`
### 3. Layout
- [ ] Contêiner responsivo com gutter de 16px no celular e sem rolagem horizontal

## Acceptance Criteria
### Must Have
- [ ] Botões e painéis visualmente alinhados à app
- [ ] Contraste AA entre texto e fundo; foco visível em todos os controles
- [ ] Sem rolagem horizontal a 390px
### Should Have
- [ ] Componentes sem estado e tipados

## Testing Requirements
```bash
pnpm --filter @agents-office/landing typecheck
pnpm lint
```
Conferir visualmente com Playwright MCP em 1440, 768 e 390px.

## Rollback Plan
Reverter `src/styles`, `src/components` e `public/fonts`.
