---
title: README comercial com instalação oficial
number: 087
priority: high
tags: [docs, readme, release]
dependencies: [086-release-workflow-macos.spec.md]
related_prd: ../prds/documentacao-do-projeto.prd.md
status: pending
created: 2026-10-12
---

# 087 - README comercial com instalação oficial

## Overview
O README passa a ser a página comercial do produto, com instalação oficial no Linux e no macOS a partir da release do GitHub e links para os demais documentos. Em inglês.

## Related PRD
- **Source**: [Documentação dedicada](../prds/documentacao-do-projeto.prd.md)
- **Section Reference**: User Stories 1-9

## Prerequisites
- [ ] Spec 086 concluída (o .dmg existe na release)

## Dependencies
- `086-release-workflow-macos.spec.md` - o .dmg precisa ser publicado

## Implementation Tasks
### 1. README.md
- [ ] Manter cabeçalho (logo, tagline, screenshot), "The idea", resumo de perfis/elenco e licença
- [ ] Nova seção **Install** com link para https://github.com/ailtonloures/agents-office/releases
- [ ] Linux: baixar o `.AppImage`, `chmod +x`, executar; informar que o app se atualiza sozinho
- [ ] macOS: baixar o `.dmg`, arrastar para Applications; explicar que o app não é assinado (clique direito > Abrir, ou `xattr -dr com.apple.quarantine`); atualizações manuais
- [ ] Nota sobre os hooks opcionais (`hooks install`) e a privacidade (127.0.0.1, sem telemetria)
- [ ] Nova seção **Documentation** com links para `DEVELOPMENT.md`, `DESIGN.md` e `ARCHITECTURE.md`
- [ ] Remover "Run locally", o processo de release e o roteiro de teste do updater (migram para o DEVELOPMENT.md, spec 088)
### 2. Verificação
- [ ] Conferir que o nome dos artefatos citados bate com o `artifactName` do `electron-builder.yml`
- [ ] Não editar `packages/cli/README.md` (cópia gerada no `prepack`)

## Acceptance Criteria
### Must Have
- [ ] README sem comandos de desenvolvimento
- [ ] Instalação clara para Linux e macOS
- [ ] Todos os links relativos resolvem
### Should Have
- [ ] Tom comercial, curto, com screenshot preservado

## Testing Requirements
```bash
pnpm typecheck && pnpm lint && pnpm vitest run
```

## Rollback Plan
Reverter o commit desta spec.
