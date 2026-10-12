---
title: Landing - seções Segurança, Instalação, Open source e Rodapé
number: 112
priority: medium
tags: [feature, landing, ui, content]
dependencies: [107-landing-tokens-estilos-e-componentes-base.spec.md, 108-landing-infra-i18n.spec.md]
related_prd: ../prds/landing-page-comercial.prd.md
status: pending
created: 2026-10-12
---

# 112 - Landing - seções Segurança, Instalação, Open source e Rodapé

## Overview
Fecha a página com privacidade e segurança, instruções de instalação por sistema, chamada para o código aberto e rodapé com idiomas.

## Related PRD
- **Source**: [Landing page comercial](../prds/landing-page-comercial.prd.md)
- **Section Reference**: User Stories 23-28; Implementation Decisions (seções, CTAs)

## Prerequisites
- [ ] Ler `README.md` (instalação e Gatekeeper) e `ARCHITECTURE.md` (Segurança)
- [ ] Conferir se existe release publicada antes de afirmar nomes de arquivos

## Dependencies
- `107-...` estilos e componentes; `108-...` i18n

## Implementation Tasks
### 1. Segurança e privacidade
- [ ] `Security`: loopback 127.0.0.1, sem telemetria, tudo local, aprovações que falham fechadas, sanitização de texto injetado em terminais
### 2. Instalação
- [ ] `Install` com abas Linux (AppImage, `chmod +x`; `.deb` com atualização manual), macOS (dmg; nota `xattr -dr com.apple.quarantine "/Applications/Agents Office.app"`), CLI (`npx agents-office hooks install`), Windows "ainda não"
- [ ] Reutilizar `CommandSnippet` com botão de copiar e retorno acessível ("copiado")
### 3. Código aberto e rodapé
- [ ] `OpenSource`: MIT, repositório, documentação (README, ARCHITECTURE, DESIGN, DEVELOPMENT), como contribuir
- [ ] `Footer` com links e `LangSwitch`
### 4. Traduções
- [ ] Chaves em `en`, `pt-BR` e `es`

## Acceptance Criteria
### Must Have
- [ ] Comandos copiáveis funcionam e informam o resultado a leitores de tela
- [ ] Afirmações de segurança batem com ARCHITECTURE.md
### Should Have
- [ ] Abas navegáveis por teclado (setas) com papéis ARIA corretos

## Testing Requirements
```bash
pnpm typecheck && pnpm lint && pnpm vitest run
pnpm --filter @agents-office/landing build
```

## Rollback Plan
Reverter as seções adicionadas e suas chaves de tradução.
