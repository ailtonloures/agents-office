---
title: CharacterFactory — sprites em camadas por profissão e hash do agentId
number: 009
priority: medium
tags: [feature, web, sprites, characters]
dependencies: [007-web-foundation-client-skin.spec.md]
related_prd: ../prds/agents-office.prd.md
status: pending
created: 2026-10-10
---

# 009 - CharacterFactory

## Overview
Monta a aparência de cada personagem a partir de camadas da skin (corpo, cabelo, roupa e acessório por profissão), com cores de pele, cabelo e roupa derivadas de forma estável do hash do id. Gera spritesheets compostos com cache por id e as animações de walk (4 direções) e de poses.

## Related PRD
- **Source**: [Agents Office](../prds/agents-office.prd.md)
- **Section Reference**: User Stories 17, 21-24; Implementation Decisions → CharacterFactory

## Prerequisites
- [ ] Spec 007 concluído

## Dependencies
- `007-...`: SkinLoader (camadas)

## Implementation Tasks
### 1. Aparência (`src/characters/appearance.ts`)
- [ ] `appearanceFor(id, profession): Appearance`, pura: hash FNV-1a do id → índices de cabelo, paletas de pele, cabelo e roupa (paletas GBC limitadas na skin)
- [ ] Acessório fixo por profissão: tech-lead (gravata/caneca), analyst (lupa/óculos), architect (prancheta), developer (headphone/moletom), qa (crachá + checklist), support (headset)

### 2. Composição (`src/characters/characterFactory.ts`)
- [ ] Compor as camadas numa RenderTexture/canvas → registrar uma textura `char-<id>` com frames; recolorir por palette swap (mapear as cores-base da skin para as paletas escolhidas)
- [ ] Criar animações Phaser: `walk-{down,up,left,right}`, `idle-{dir}`, `sit-type`, `read`, `phone`, `sleep`, `celebrate`
- [ ] Cache por id; liberar a textura quando o personagem sai

### 3. Testing
- [ ] `test/appearance.test.ts`: mesmo id → mesma aparência; 100 ids aleatórios → distribuição razoável (sem uma única combinação acima de 20%); cada profissão → acessório correto
- [ ] Página de debug `?debug=characters` exibindo uma grade de 24 personagens (verificação visual)

## Acceptance Criteria
### Must Have
- [ ] Aparência estável entre reloads da página
- [ ] Todas as profissões renderizam com as animações sem frames faltando

### Should Have
- [ ] Contorno escuro de 1 px típico do GBC

## Testing Requirements
```bash
pnpm --filter @agents-office/web test appearance
pnpm typecheck && pnpm lint
```

## Rollback Plan
Remover `src/characters/appearance.ts` e `characterFactory.ts`.
