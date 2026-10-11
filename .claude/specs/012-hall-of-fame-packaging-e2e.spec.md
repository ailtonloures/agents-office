---
title: Hall da Fama, empacotamento npm (npx agents-office) e E2E Playwright
number: 012
priority: medium
tags: [feature, web, release, e2e, testing]
dependencies: [006-hooks-cli-settings-merger.spec.md, 011-player-avatar-dialog-hud.spec.md]
related_prd: ../prds/agents-office.prd.md
status: pending
created: 2026-10-10
---

# 012 - Hall da Fama, empacotamento e E2E

## Overview
Fecha o MVP: mural do Hall da Fama no lobby, pacote npm publicável `agents-office` (daemon + web buildada + skin padrão) que roda com `npx agents-office`, e a suíte E2E Playwright (**Seam 4**) usando `window.__office`.

## Related PRD
- **Source**: [Agents Office](../prds/agents-office.prd.md)
- **Section Reference**: User Stories 1, 48, 50; Implementation Decisions → Distribuição; Testing Decisions → Seam 4

## Prerequisites
- [ ] Specs 006 e 011 concluídos

## Dependencies
- `006-...`: comandos de hooks no binário publicado
- `011-...`: interação completa para o E2E

## Implementation Tasks
### 1. Hall da Fama
- [ ] Mural no lobby (poi `board`); A no mural abre o diálogo com os últimos 20 concluídos: profissão, descrição, projeto, duração e horário

### 2. Empacotamento
- [ ] Pacote publicável `agents-office` (pode ser o próprio `packages/daemon` renomeado, ou um pacote `packages/cli` que inclui o build): `bin`, `files` (dist do daemon, dist da web, skins/default), `engines.node >=20`
- [ ] Build: `pnpm build` gera tudo; `pnpm pack` + `npx ./agents-office-*.tgz` funciona numa pasta limpa
- [ ] README: instalação, `hooks install`, flags, skins externas (como usar LimeZu localmente sem redistribuir), privacidade (localhost, sem telemetria), aviso de que o formato dos transcripts pode mudar
- [ ] Workflow de CI (GitHub Actions): install, typecheck, lint, test e build

### 3. E2E (Seam 4) (`e2e/`)
- [ ] Playwright: sobe o daemon com `--projects-dir` temporário + `--no-open` e porta aleatória; abre a página
- [ ] Cenário 1: escrever a fixture `parallel-subagents` incrementalmente → `window.__office.characters` passa por 1 tech-lead + 3 agentes com `status` working → após `agent.finished`, os agentes ficam `gone`; screenshots em cada fase
- [ ] Cenário 2: mover o player até um agente (helper que teleporta para o tile adjacente via debug) → pressionar Enter → o diálogo contém a descrição da tarefa
- [ ] Cenário 3: POST `/hook` Notification → o personagem mostra waiting e o HUD `! 1`
- [ ] Cenário 4: reiniciar o daemon → a página reconecta e reconstrói o estado

## Acceptance Criteria
### Must Have
- [ ] `npx agents-office` a partir do tarball sobe e abre o escritório funcionando contra o `~/.claude/projects` real
- [ ] Os 4 cenários E2E passam em headless
- [ ] Nenhum asset não-CC0 no pacote (checagem do `skins/default/LICENSES.md`)

### Should Have
- [ ] CI verde
- [ ] GIF de demo no README

## Testing Requirements
```bash
pnpm build
pnpm test
pnpm --filter e2e exec playwright test
pnpm pack && cd "$(mktemp -d)" && npx /path/to/agents-office-*.tgz --no-open
```

## Rollback Plan
Reverter as alterações de empacotamento/CI; o mural é isolado em `src/ui/hallOfFame.ts` e pode ser removido sem afetar o resto.
