---
title: Config de publicação e workflow de release
number: 055
priority: high
tags: [enhancement, desktop, ci, release]
dependencies: []
related_prd: ../prds/auto-update-releases.prd.md
status: done
created: 2026-10-11
---

# 055 - Config de publicação e workflow de release

## Overview
Adiciona electron-updater, configura publicação GitHub e cria o workflow que gera a release a cada tag vX.Y.Z.

## Related PRD
- **Source**: [Auto-update e releases](../prds/auto-update-releases.prd.md)

## Dependencies
- Nenhuma

## Implementation Tasks
### 1. Build
- [ ] Adicionar `electron-updater` em `dependencies` de `packages/desktop/package.json`
- [ ] Incluí-lo no `external` de `packages/desktop/scripts/build.mjs`
- [ ] `electron-builder.yml`: bloco `publish` (github, owner ailtonloures, repo agents-office); atualizar comentário "no auto-update in v1"
- [ ] Corrigir `homepage`/`repository` dos package.json para ailtonloures/agents-office
### 2. Workflow
- [ ] `.github/workflows/release.yml`: trigger tag `v*`, ubuntu-latest, pnpm 9, Node 22, `permissions: contents: write`
- [ ] Passo que falha se a tag != versão de `packages/desktop/package.json`
- [ ] Build, stage-daemon e `electron-builder --linux AppImage --publish always` com `GH_TOKEN`
- [ ] Release com AppImage + `latest-linux.yml` e notas geradas
### 3. Testes
- [ ] Ampliar `packages/desktop/test/packaging.test.ts` (publish, workflow)

## Acceptance Criteria
- [ ] `pnpm --filter @agents-office/desktop dist` gera AppImage, `latest-linux.yml` e `app-update.yml` embutido
- [ ] Workflow válido e testes verdes

## Testing Requirements
```bash
pnpm typecheck && pnpm lint && pnpm vitest run
```

## Rollback Plan
Reverter o commit desta spec.
