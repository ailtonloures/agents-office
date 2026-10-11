---
title: Spike de validação — PermissionRequest, timeout de hook e pty
number: 013
priority: high
tags: [spike, hooks, research, desktop]
dependencies: []
related_prd: ../prds/desktop-app-permissions.prd.md
status: done
created: 2026-10-10
---

# 013 - Spike de validação — PermissionRequest, timeout de hook e pty

## Overview
Valida, com o Claude Code real e documentando em `.claude/learnings/`, as premissas que os specs 014-025 assumem: formato de saída do hook `PermissionRequest`, comportamento do prompt do terminal enquanto o hook espera, teto do `timeout` de hook, payload do pedido e como o `claude` roda dentro de um pty. Não entrega código de produto; entrega um relatório e scripts descartáveis de experimento.

## Related PRD
- **Source**: [Agents Office Desktop e aprovação de permissões](../prds/desktop-app-permissions.prd.md)
- **Section Reference**: Premissas a validar antes dos specs; Out of Scope

## Prerequisites
- [x] Claude Code instalado e autenticado na máquina de teste
- [x] Pasta temporária de experimento (nunca o settings.json real; usar `--settings`/projeto temporário com `.claude/settings.local.json`)

## Dependencies
- Nenhuma

## Implementation Tasks
### 1. Hook PermissionRequest
- [x] Criar um projeto temporário com `.claude/settings.local.json` contendo um hook `PermissionRequest` que registra o stdin recebido em arquivo e devolve `{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"allow"}}}`
- [x] Registrar o payload completo: campos de sessão, ferramenta, input, e se há identificação de subagente (`agent_id`/equivalente) quando um subagente pede permissão
- [x] Testar `deny` com `message` e confirmar que o texto chega ao Claude como feedback
- [x] Testar saída vazia + exit 0 (deve cair no prompt normal do terminal)
- [x] Confirmar que ferramentas já permitidas por regra **não** disparam o hook

### 2. Espera e timeout
- [x] Hook que dorme 60 s antes de responder: o prompt do terminal aparece durante a espera ou só depois? Registrar
- [x] Ao liberar sem decisão, o prompt reaparece normalmente?
- [x] Descobrir o maior `timeout` aceito no campo do hook (testar 600, 3600, 86400 e valores acima); registrar o comportamento ao estourar
- [x] Matar o processo do hook no meio da espera: o Claude Code segue para o prompt do terminal?

### 3. Claude em pty
- [x] Script Node com `node-pty` iniciando `claude` num diretório temporário; confirmar que os hooks instalados disparam e que o transcript é gerado em `~/.claude/projects`
- [x] Verificar se uma variável de ambiente passada ao pty (ex.: `AGENTS_OFFICE_TERMINAL_ID`) é visível ao processo do hook (para o vínculo aba ↔ sessão no spec 023)
- [x] Descobrir como achar o `claude` fora de um shell interativo (PATH de app gráfico vs shell de login)
- [x] Confirmar que `node-pty` compila e carrega sob Electron (`electron-rebuild`) em Linux (macOS: verificação manual quando houver máquina)
  - Resultado: Linux verificado; macOS e empacotamento com asar NÃO verificados (ver relatório)

### 4. Relatório
- [x] Escrever `.claude/learnings/permission-hook-and-pty.md` com os resultados, o formato exato de entrada/saída e as decisões que mudam os specs seguintes
- [x] Listar divergências em relação aos PRDs e propor ajustes nos specs 014-025 (editar os specs afetados)

## Acceptance Criteria
### Must Have
- [x] Relatório `.claude/learnings/permission-hook-and-pty.md` com resposta objetiva para cada premissa
- [x] Specs 014-025 ajustados onde uma premissa se mostrou falsa

### Should Have
- [x] Scripts de experimento guardados em `.claude/learnings/spike-scripts/` para repetição

## Testing Requirements
```bash
# verificação manual; nenhum teste automatizado
ls .claude/learnings/permission-hook-and-pty.md
```

## Rollback Plan
Apagar o relatório e os scripts do spike; nenhum código de produto é alterado.

## Resultado
Relatório em `.claude/learnings/permission-hook-and-pty.md`. Premissa falsa: o prompt do terminal aparece em paralelo ao hook (afeta specs 014, 015, 016). Ajustes também em 019, 020, 022 e 023. Não verificados: macOS, teto efetivo de `timeout`, default do `timeout`, empacotamento com asar, hooks antes da confiança da pasta.
