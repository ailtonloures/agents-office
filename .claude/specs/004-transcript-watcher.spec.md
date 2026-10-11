---
title: TranscriptWatcher — tail incremental de ~/.claude/projects
number: 004
priority: high
tags: [feature, daemon, filesystem, testing]
dependencies: [002-normalizer-jsonl-and-hooks.spec.md]
related_prd: ../prds/agents-office.prd.md
status: pending
created: 2026-10-10
---

# 004 - TranscriptWatcher

## Overview
Observa o diretório de projetos do Claude Code, detecta JSONL de sessões e subagentes e os `.meta.json`, faz tail incremental por offset e entrega inputs ao Normalizer. Na carga inicial, considera só arquivos modificados dentro de `initialWindowMs`.

## Related PRD
- **Source**: [Agents Office](../prds/agents-office.prd.md)
- **Section Reference**: User Stories 2, 9, 15, 37; Implementation Decisions → TranscriptWatcher, Fontes de dados

## Prerequisites
- [ ] Spec 002 concluído

## Dependencies
- `002-...`: tipos de input do Normalizer

## Implementation Tasks
### 1. Watcher (`packages/daemon/src/watcher/`)
- [ ] `createTranscriptWatcher({ projectsDir, initialWindowMs, onInput })` com `start()`/`stop()`
- [ ] Usar `chokidar` (com `awaitWriteFinish` desligado e `usePolling` como fallback configurável) observando `*/*.jsonl`, `*/*/subagents/*.jsonl` e `*/*/subagents/*.meta.json`
- [ ] Classificar o path: sessão (`<slug>/<sessionId>.jsonl`), agente (`<slug>/<sessionId>/subagents/agent-<id>.jsonl`), meta
- [ ] Tail por offset: guardar `bytesRead` por arquivo; ler só o delta; bufferizar a linha parcial sem `\n` até o próximo append; tratar truncamento (tamanho < offset → reset)
- [ ] Ordem: o meta de um agente é emitido antes das linhas do agente; ao descobrir um JSONL de agente sem meta, tentar ler o meta
- [ ] Carga inicial: ignorar arquivos com `mtime` mais antigo que `initialWindowMs`; para os recentes, ler desde o início (para reconstruir o estado)
- [ ] Coalescer leituras (debounce ~50 ms por arquivo) para respeitar a latência < 2 s
- [ ] Erros de I/O logados e engolidos, nunca derrubam o processo

### 2. Testing
- [ ] `test/watcher.test.ts` com diretório temporário:
  - criar sessão + appends linha a linha → inputs em ordem
  - linha escrita em dois pedaços → um único input completo
  - arquivo antigo (mtime ajustado) → ignorado na carga inicial
  - subagente: meta + JSONL → meta chega primeiro
  - truncamento do arquivo → sem crash, releitura

## Acceptance Criteria
### Must Have
- [ ] Nenhuma linha duplicada ou perdida nos testes de append
- [ ] Latência do append até `onInput` < 500 ms no teste
- [ ] `stop()` libera todos os handles (teste termina sem timeout)

### Should Have
- [ ] Log de debug opcional (`AGENTS_OFFICE_DEBUG=1`)

## Testing Requirements
```bash
pnpm --filter @agents-office/daemon test watcher
pnpm typecheck && pnpm lint
```

## Rollback Plan
Remover `packages/daemon/src/watcher/` e a dependência `chokidar`.
