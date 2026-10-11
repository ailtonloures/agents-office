---
title: PlayerAvatar, DialogBox estilo Pokémon e HUD
number: 011
priority: high
tags: [feature, web, interaction, ui]
dependencies: [010-character-controller-lifecycle.spec.md]
related_prd: ../prds/agents-office.prd.md
status: pending
created: 2026-10-10
---

# 011 - PlayerAvatar, DialogBox e HUD

## Overview
Interação do usuário: um avatar movido por setas/WASD com colisão e câmera seguindo; o botão A/Enter (ou clique) abre uma caixa de diálogo estilo Pokémon com os dados do agente ou da sessão; um HUD com totais e um atalho para a sala mais ativa.

## Related PRD
- **Source**: [Agents Office](../prds/agents-office.prd.md)
- **Section Reference**: User Stories 38-46

## Prerequisites
- [ ] Spec 010 concluído

## Dependencies
- `010-...`: personagens na cena e o modelo associado

## Implementation Tasks
### 1. PlayerAvatar (`src/player/`)
- [ ] Movimento grid-based tile a tile (setas/WASD), virar sem andar com um toque curto, colisão com móveis, paredes e personagens
- [ ] Spawn no lobby; aparência fixa e distinta (boné, como o protagonista)
- [ ] Câmera segue com lerp, limitada aos bounds do prédio

### 2. DialogBox (`src/ui/dialogBox.ts`)
- [ ] Caixa na parte inferior (borda dupla GBC), texto com efeito typewriter, seta ▼ piscando, A/Enter/Espaço avança, B/Esc fecha
- [ ] Interação: A com o personagem no tile à frente, ou clique com o mouse
- [ ] Conteúdo do agente: `<Profissão> (<agentType>)`, descrição da tarefa, "Agora: <tool + summary>", últimos 5 passos, tempo ativo, tokens in/out. Conteúdo do Tech Lead: projeto, sessão (id curto), último prompt resumido, lista de subordinados ativos e status
- [ ] Páginas de diálogo de no máximo 3 linhas por tela; textos truncados (nunca o conteúdo completo de arquivos)
- [ ] Movimento do player bloqueado enquanto o diálogo está aberto; o personagem alvo vira para o player

### 3. HUD (`src/ui/hud.ts`)
- [ ] Barra superior: `SESS n · AGENTES n · ! n` (o ! conta os waiting, piscando quando > 0) + indicador de conexão
- [ ] Tecla `Tab`: teleporta a câmera/player para a frente da sala com a atividade mais recente; `Shift+Tab` cicla pelos agentes waiting

### 4. Testing
- [ ] `test/dialogContent.test.ts`: formatter puro de Agent/Session → páginas de texto (truncamento, quebra em 3 linhas, tokens formatados como `12.3k`)

## Acceptance Criteria
### Must Have
- [ ] Andar até um funcionário e apertar A mostra a tarefa correta dele
- [ ] O HUD bate com o `/health` do daemon

### Should Have
- [ ] Clique como alternativa ao A

## Testing Requirements
```bash
pnpm --filter @agents-office/web test dialogContent
pnpm typecheck && pnpm lint
```

## Rollback Plan
Remover `src/player/` e `src/ui/`; a cena continua funcionando como visualização passiva.
