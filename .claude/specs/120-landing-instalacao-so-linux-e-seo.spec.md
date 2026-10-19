---
title: Landing - instalação só Linux (AppImage e .deb) e SEO
number: 120
priority: high
tags: [bugfix, landing, i18n, seo, testing]
dependencies: []
related_prd: ../prds/landing-modo-ativo-e-instalacao-linux.prd.md
status: pending
created: 2026-10-18
---

# 120 - Landing - instalação só Linux (AppImage e .deb) e SEO

## Overview
A landing promete macOS e usa o nome de arquivo `linux-x64.AppImage`, que não existe na release. Esta spec deixa a instalação restrita ao Linux (AppImage e .deb) com os nomes reais e alinha o JSON-LD.

## Related PRD
- **Source**: [Landing - modo ativo e passivo, instalação só Linux](../prds/landing-modo-ativo-e-instalacao-linux.prd.md)
- **Section Reference**: User Stories 14 a 18, 21, 22; Implementation Decisions (Instalação, SEO)

## Prerequisites
- [ ] `pnpm typecheck && pnpm lint && pnpm vitest run` verdes antes de começar

## Dependencies
- Nenhuma

## Implementation Tasks
### 1. Testes primeiro (Red)
- [ ] `packages/landing/test/seo.test.ts`: JSON-LD com `operatingSystem` igual a `Linux` e descrição sem "macOS" (ajustar as asserções das linhas ~34-37 e dizer o motivo)
- [ ] `packages/landing/test/i18n.test.ts`: para `en`, `pt-BR` e `es`, nenhuma chave `install.*` cita `macOS`, `.dmg` ou `xattr` como suportado, nem `linux-x64`; os comandos contêm `linux-x86_64.AppImage` e `linux-amd64.deb`
- [ ] Rodar e ver falhar: `pnpm vitest run packages/landing/test`

### 2. Conteúdo e estrutura (Green)
- [ ] `packages/landing/src/i18n/messages/{en,pt-BR,es}.ts`: remover as chaves da aba macOS; Linux com AppImage (`chmod +x` e executar, auto-atualiza) e .deb (`sudo apt install ./agents-office-*-linux-amd64.deb`, atualização manual); aba CLI rotulada como opcional do modo passivo; mensagem de indisponibilidade cobrindo macOS e Windows; `hero.platforms` dizendo Linux (AppImage e .deb)
- [ ] `packages/landing/src/sections/Install.tsx`: ordem das abas `linux`, `cli`, e a indisponível (sem macOS); ajustar o tipo/estado de abas e `tabsLogic` se referenciarem macOS
- [ ] `packages/landing/src/lib/seo.ts`: `operatingSystem: 'Linux'` e comentário da linha ~149
- [ ] `packages/landing/src/config.ts`: remover referências a macOS, se houver
- [ ] `e2e/tests/landing.spec.ts`: se algum passo clicar na aba macOS, remover

### 3. Refatorar
- [ ] `pnpm format` e lint limpos

## Acceptance Criteria
### Must Have
- [ ] Os testes novos falharam antes e passam agora
- [ ] Nenhuma menção a macOS como suportado nos três idiomas
- [ ] Comandos copiáveis usam os nomes reais dos arquivos
- [ ] Paridade de chaves de i18n verde
### Should Have
- [ ] `packages/landing/test/tabsLogic.test.ts` coerente com as abas atuais

## Testing Requirements
```bash
pnpm vitest run packages/landing/test
pnpm typecheck && pnpm lint
```

## Rollback Plan
`git revert` do commit; nenhuma migração ou dado envolvido.
