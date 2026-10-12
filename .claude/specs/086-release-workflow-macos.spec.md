---
title: Release workflow publica o instalador do macOS
number: 086
priority: high
tags: [infra, ci, release, macos]
dependencies: []
related_prd: ../prds/documentacao-do-projeto.prd.md
status: pending
created: 2026-10-12
---

# 086 - Release workflow publica o instalador do macOS

## Overview
Hoje a release do GitHub só recebe o AppImage de Linux. O .dmg do macOS existe apenas como artefato do CI. Esta spec adiciona um job de macOS ao workflow de release, para que a instalação documentada no README seja verdadeira.

## Related PRD
- **Source**: [Documentação dedicada](../prds/documentacao-do-projeto.prd.md)
- **Section Reference**: Implementation Decisions (job de macOS), User Stories 4, 14

## Prerequisites
- [ ] Ler `.github/workflows/release.yml` e `packages/desktop/electron-builder.yml`
- [ ] Ler `.claude/learnings/auto-update-release.md`

## Dependencies
- Nenhuma

## Implementation Tasks
### 1. Workflow
- [ ] Em `.github/workflows/release.yml`, manter o job de Linux (ele cria a release) e adicionar um job `macos-latest` com `needs` no job de Linux
- [ ] Repetir a verificação de que a tag é igual a `v<versão de packages/desktop/package.json>`
- [ ] Repetir os passos do Linux: `pnpm install --frozen-lockfile`, `pnpm --workspace-root build`, `stage-daemon.mjs`
- [ ] Empacotar com `electron-builder --config electron-builder.yml --mac dmg --publish always`, com `CSC_IDENTITY_AUTO_DISCOVERY=false`
- [ ] Reaproveitar versões de actions, Node e pnpm do job de Linux
### 2. Documentação
- [ ] Atualizar `.claude/learnings/auto-update-release.md` com o job de macOS e a observação de que o auto-update continua só no AppImage
### 3. Testing
- [ ] Validar o YAML (actionlint se disponível, senão parse)

## Acceptance Criteria
### Must Have
- [ ] O job de macOS só roda depois de a release existir
- [ ] O .dmg é anexado à mesma release do AppImage
- [ ] O job de Linux continua inalterado
### Should Have
- [ ] Nome do artefato segue o padrão `agents-office-${version}-${os}-${arch}.${ext}`
### Nota
- [ ] O job só é validado de verdade no primeiro push de tag; registrar isso no learning

## Testing Requirements
```bash
pnpm typecheck && pnpm lint && pnpm vitest run
```

## Rollback Plan
Reverter o commit desta spec; o workflow volta a publicar só o Linux.
