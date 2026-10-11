---
title: Web foundation — Vite + Phaser 3, OfficeClient, SkinLoader e DebugState
number: 007
priority: high
tags: [feature, web, phaser, websocket]
dependencies: [005-daemon-server-stream-and-hook-receiver.spec.md]
related_prd: ../prds/agents-office.prd.md
status: pending
created: 2026-10-10
---

# 007 - Web foundation

## Overview
Base do cliente: um jogo Phaser 3 em resolução interna 320x180 com escala inteira e pixel art nítido, um cliente WS com reconexão que espelha o `OfficeModel`, um carregador de skins (skin CC0 padrão + pasta externa) e o `window.__office` para testes.

## Related PRD
- **Source**: [Agents Office](../prds/agents-office.prd.md)
- **Section Reference**: User Stories 16, 47, 49-50; Implementation Decisions → web (OfficeClient, SkinLoader, DebugState), Estilo GBC/GBA

## Prerequisites
- [ ] Spec 005 concluído (WS `/stream`)

## Dependencies
- `005-...`: protocolo WS e servidor de estáticos

## Implementation Tasks
### 1. App (`packages/web/`)
- [ ] Vite + TypeScript + Phaser 3 (`pixelArt: true`, `roundPixels: true`, 320x180, `Scale.FIT` com zoom inteiro calculado no resize, fundo letterbox)
- [ ] Fonte bitmap pixel (CC0/OFL) para HUD e diálogos
- [ ] Proxy de dev do Vite para `/stream` e `/health` (porta 4777)
- [ ] Cenas: `BootScene` (carrega a skin) → `OfficeScene` (vazia por enquanto, com um placeholder "Aguardando agentes…")

### 2. OfficeClient (`src/net/officeClient.ts`)
- [ ] Conecta em `/stream`; aplica o snapshot e os eventos com o **mesmo reducer** do daemon (mover o reducer para `shared` se necessário para reuso) ou espelha os deltas
- [ ] Emite `EventEmitter` tipado: `model`, `event`, `connection`
- [ ] Reconexão com backoff (1 s → 10 s); ao reconectar, substitui pelo snapshot novo
- [ ] Indicador de conexão no canto (ponto verde/vermelho)

### 3. SkinLoader (`src/skin/`)
- [ ] Formato `skin.json`: tileset (imagem + tileSize 16 + ids nomeados de tiles: floor, wall, door, desk, chair, computer, server-rack, phone, window, plant, sign, board), camadas de personagem (body, hair[], outfit por profissão, accessory por profissão) com frames de 4 direções × walk (3 frames) + poses (sit-type, read, phone, sleep)
- [ ] Skin padrão em `skins/default/`, **apenas CC0** (ex.: Kenney/OpenGameArt CC0 ou arte placeholder própria), com `LICENSES.md` listando as fontes
- [ ] Skin externa: o daemon serve `--skin <dir>` em `/skin/*`; a web usa `/skin/skin.json` se existir, senão o padrão
- [ ] Validar `skin.json` com zod; em caso de erro, usar o padrão e mostrar um aviso

### 4. DebugState
- [ ] `window.__office = { connected, model, characters: [{id, role, profession, status, roomId, x, y}] }`, atualizado a cada frame relevante (personagens vêm dos specs 009/010)

### 5. Build
- [ ] `pnpm --filter web build` gera `dist/`, servido pelo daemon

## Acceptance Criteria
### Must Have
- [ ] `pnpm dev` (daemon + vite) abre a página, conecta e mostra o status de conexão
- [ ] Pixels nítidos sem blur em 1x, 2x, 3x e 4x
- [ ] Desligar o daemon → indicador vermelho; religar → reconecta sozinho

### Should Have
- [ ] Skin externa carregada via `--skin`

## Testing Requirements
```bash
pnpm --filter @agents-office/web build
pnpm typecheck && pnpm lint
pnpm dev   # verificação manual no navegador
```

## Rollback Plan
Remover `packages/web/src` e `skins/default`, além do serviço de estáticos/skin no daemon.
