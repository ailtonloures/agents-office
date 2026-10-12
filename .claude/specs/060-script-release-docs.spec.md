---
title: Script de release e documentação
number: 060
priority: low
tags: [docs, release, tooling]
dependencies: [055-config-publicacao-workflow-release.spec.md]
related_prd: ../prds/auto-update-releases.prd.md
status: done
created: 2026-10-11
---

# 060 - Script de release e documentação

## Overview
Comando pnpm release e documentação do processo de release.

## Related PRD
- **Source**: [Auto-update e releases](../prds/auto-update-releases.prd.md)

## Dependencies
- [055-config-publicacao-workflow-release.spec.md]

## Implementation Tasks
### 1. Tooling
- [ ] Script `release <patch|minor|major>` na raiz: bump de versão do desktop, commit e tag `vX.Y.Z`
### 2. Docs
- [ ] `.claude/learnings/auto-update-releases.md` (processo, limitações deb/macOS, variável APPIMAGE)
- [ ] Seção "Releases" no README
- [ ] Verificação manual ponta a ponta com tag de teste (0.1.0 → 0.1.1)

## Acceptance Criteria
- [ ] Um mantenedor consegue publicar seguindo só a documentação

## Testing Requirements
```bash
pnpm typecheck && pnpm lint && pnpm vitest run
```

## Rollback Plan
Reverter o commit desta spec.
