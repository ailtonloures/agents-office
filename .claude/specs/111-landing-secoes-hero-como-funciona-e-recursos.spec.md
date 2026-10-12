---
title: Landing - seções Hero, Como funciona, Recursos e Arquitetura
number: 111
priority: high
tags: [feature, landing, ui, content]
dependencies: [107-landing-tokens-estilos-e-componentes-base.spec.md, 108-landing-infra-i18n.spec.md, 110-landing-pixel-office-canvas-e-sprites.spec.md]
related_prd: ../prds/landing-page-comercial.prd.md
status: pending
created: 2026-10-12
---

# 111 - Landing - seções Hero, Como funciona, Recursos e Arquitetura

## Overview
Implementa o corpo principal da página: navegação, hero com PixelOffice e CTAs, explicação da metáfora, os blocos de recursos (terminais, perfis, Agent Bus, quadro, navegador embutido) e o resumo da arquitetura. Todo texto passa pelo `t()` nos três idiomas.

## Related PRD
- **Source**: [Landing page comercial](../prds/landing-page-comercial.prd.md)
- **Section Reference**: User Stories 1-4, 6-22; Implementation Decisions (seções, conteúdo factual, CTAs)

## Prerequisites
- [ ] Ler `README.md`, `ARCHITECTURE.md` (Agent Bus, Quadro, Navegador) e `DESIGN.md`
- [ ] Confirmar status do navegador embutido (beta) e quais recursos são só desktop

## Dependencies
- `107-...` estilos e componentes; `108-...` i18n; `110-...` PixelOffice

## Implementation Tasks
### 1. Navegação e Hero (`src/sections/`)
- [ ] `Nav` fixa com âncoras, `LangSwitch` e link do GitHub; menu compacto no celular
- [ ] `Hero`: título, subtítulo, PixelOffice, CTAs (Baixar → última release; Estrela → repositório) e linha `npx agents-office hooks install` com botão de copiar (componente `CommandSnippet`)
- [ ] Constantes em `src/config.ts`: `REPO_URL`, `RELEASES_URL`, `SITE_URL` (configurável)
### 2. Como funciona
- [ ] `HowItWorks`: projeto = sala, sessão = Tech Lead, subagente = funcionário; leitura passiva de transcripts e hooks opcionais
### 3. Recursos
- [ ] `Features` com blocos: Observabilidade ao vivo, Terminais integrados, Elenco (perfis personalizáveis), Agent Bus, Quadro Excalidraw, Navegador embutido (`BetaBadge`)
- [ ] Mini-ilustração pixel/painel por bloco com acento do papel; selo `DesktopBadge` nos recursos exclusivos do desktop
### 4. Arquitetura
- [ ] `Architecture`: diagrama SVG pixel em 4 passos (Claude Code → transcripts + hooks → daemon → WebSocket → cliente) e extensões do desktop (node-pty, Agent Bus, updater); chips da stack (pnpm, TypeScript, zod, Phaser, Electron)
### 5. Traduções
- [ ] Chaves em `en`, `pt-BR` e `es` para todas as seções acima

## Acceptance Criteria
### Must Have
- [ ] Todos os textos nos 3 idiomas; nenhum texto fixo no JSX
- [ ] Navegador embutido marcado beta; Windows não aparece como suportado
- [ ] CTAs apontam para URLs corretas
### Should Have
- [ ] Animação de entrada discreta que respeita movimento reduzido

## Testing Requirements
```bash
pnpm typecheck && pnpm lint && pnpm vitest run
pnpm --filter @agents-office/landing build
```
Conferir com Playwright MCP em 1440, 768 e 390px nos três idiomas.

## Rollback Plan
Reverter `src/sections`, `CommandSnippet`, `config.ts` e as chaves de tradução adicionadas.
