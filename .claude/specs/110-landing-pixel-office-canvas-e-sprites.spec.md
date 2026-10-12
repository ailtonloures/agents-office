---
title: Landing - PixelOffice em canvas e sprites CC0
number: 110
priority: high
tags: [feature, landing, canvas, assets]
dependencies: [107-landing-tokens-estilos-e-componentes-base.spec.md, 109-landing-logica-da-cena-do-escritorio.spec.md]
related_prd: ../prds/landing-page-comercial.prd.md
status: pending
created: 2026-10-12
---

# 110 - Landing - PixelOffice em canvas e sprites CC0

## Overview
Renderiza a cena da spec 109 num canvas 2D com sprites fatiados da skin padrão, copiados para a pasta pública da landing. Respeita movimento reduzido e pausa fora da viewport.

## Related PRD
- **Source**: [Landing page comercial](../prds/landing-page-comercial.prd.md)
- **Section Reference**: User Stories 2, 34, 36, 43; Implementation Decisions (hero animado, sprites)

## Prerequisites
- [ ] Ler `packages/web/public/skins/default/skin.json` e `LICENSES.md`
- [ ] Ler `packages/web/scripts/skin/` (como sprites e props são geradas)

## Dependencies
- `107-landing-tokens-estilos-e-componentes-base.spec.md` - estilos
- `109-landing-logica-da-cena-do-escritorio.spec.md` - snapshot da cena

## Implementation Tasks
### 1. Assets
- [ ] Copiar para `packages/landing/public/sprites/` apenas o necessário: `tileset.png`, `props.png`, `body`, `hair`, `outfit-*` e `accessory-*` usados e o `skin.json` recortado; nunca editar os PNGs, e não tocar `packages/web/public/skins`
- [ ] `public/sprites/LICENSES.md` declarando CC0 e a origem (gerador da skin) de cada arquivo
### 2. Componente (`src/components/PixelOffice.tsx`)
- [ ] Carregar sprites, montar a sala (piso, paredes, janela, mesas, monitores) e compor personagens por camadas (corpo, roupa por papel, cabelo, acessório)
- [ ] Loop com `requestAnimationFrame` chamando `sceneAt(now)`; zoom inteiro calculado pela largura do contêiner; `imageSmoothingEnabled = false`
- [ ] Pausar com `IntersectionObserver` e com `document.hidden`
- [ ] Com `prefers-reduced-motion`, desenhar um quadro estático representativo
- [ ] `aria-label` descritivo traduzido e `role="img"`; fallback com imagem estática se o canvas falhar
### 3. Desempenho
- [ ] Pré-compor sprites em offscreen; sem alocação por quadro; DPR limitado

## Acceptance Criteria
### Must Have
- [ ] Hero anima suavemente a 60fps em desktop comum
- [ ] Quadro estático com movimento reduzido; pausa fora da tela
- [ ] Teste de licenças do cli continua verde
### Should Have
- [ ] Peso total dos sprites abaixo de 150 KB

## Testing Requirements
```bash
pnpm --filter @agents-office/landing build
pnpm typecheck && pnpm lint && pnpm vitest run
```
Conferir visualmente com Playwright MCP, inclusive com `prefers-reduced-motion`.

## Rollback Plan
Reverter `PixelOffice.tsx` e `public/sprites/`.
