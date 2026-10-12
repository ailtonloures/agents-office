---
title: Painel Elenco e editor de perfil com pré-visualização
number: 065
priority: medium
tags: [feature, web, ui]
dependencies: [064-sessoes-gerenciadas-reabertura.spec.md]
related_prd: ../prds/perfis-sessoes-gerenciadas.prd.md
status: pending
created: 2026-10-11
---

# 065 - Painel Elenco e editor de perfil com pré-visualização

## Overview
UI para criar/editar perfis (com avatar ao vivo e sortear aparência), montar o elenco do projeto, iniciar/encerrar sessões e editar notas.

## Related PRD
- **Source**: [Perfis de agente e sessões gerenciadas](../prds/perfis-sessoes-gerenciadas.prd.md)

## Prerequisites
- [ ] `064-sessoes-gerenciadas-reabertura.spec.md` concluída

## Dependencies
- [064-sessoes-gerenciadas-reabertura.spec.md]

## Implementation Tasks
### 1. UI
- [ ] Editor de perfil no estilo de `projectPicker`/`settingsPanel`: nome, instruções (Markdown), permissão, modelo, aparência com pré-visualização e "sortear"
- [ ] Painel Elenco: adicionar/remover perfis, iniciar/encerrar, `autoReopen`, ver/editar notas, aviso ao apagar perfil em uso
- [ ] Botões de acesso na área do escritório (padrão do spec 039)
### 2. Testes
- [ ] Testes de lógica pura do painel e do formulário; E2E do fluxo criar perfil → iniciar → ver avatar

## Acceptance Criteria
- [ ] Fluxo completo sem terminal externo
- [ ] Mensagens claras para claude ausente e pasta inválida
- [ ] `pnpm typecheck && pnpm lint && pnpm vitest run` verdes

## Testing Requirements
```bash
pnpm typecheck && pnpm lint && pnpm vitest run
```

## Rollback Plan
Reverter o commit desta spec.
