# Pedidos de permissão apenas notificam (specs 029–031)

## Modelo
- O hook `PermissionRequest` é não bloqueante (mesmo envio rápido dos outros eventos). `/hook/permission` ficou só como rota legada que responde 204, para hooks antigos não travarem.
- O daemon é um rastreador: `permission.requested` ao receber o hook, `permission.resolved {kind, id}` (sem `by`/`decision`) quando chega evento que indica resposta no terminal (PostToolUse/PostToolUseFailure/PermissionDenied equivalentes, Stop, UserPromptSubmit, SessionEnd, SubagentStop). Quem decide é sempre o terminal.

## Fechamento reativo da notificação (desktop)
- `PermissionTracker.apply` devolve `resolvedIds` (só quando não vazio) em três casos: `permission.resolved` de id pendente, snapshot que omite ids antes pendentes, e `clear()` (queda do socket ou `stop()`), que devolve os ids pendentes. Assim a reconexão nunca deixa notificação órfã; o snapshot seguinte recria só o que é real (sem renotificar: snapshot nunca gera `notice`).
- `NotificationCenter` (`src/main/notificationCenter.ts`) mantém o mapa id -> handle; `Shell.onPermissionResolved(ids)` chama `dismiss(id)`, que chama `close()` (best effort, em try/catch). A regra de não notificar com janela visível e focada e o clique que mostra a janela ficam no `Shell`.
- Testável sem Electron: `NotificationCenter` recebe `isSupported/create/canClose`; os testes usam uma `FakeNotification`.

## Limites do `close()` no Linux
- Em Electron, `Notification.close()` depende do servidor de notificações (libnotify); em alguns daemons a notificação continua na tela ou `close` é no-op. Por isso `canClose` é `process.platform !== 'linux'`: no Linux a notificação nasce com `closeButtonText: 'Fechar'` (botão nativo) e o timeout padrão do sistema, e ainda tentamos `close()`. `closeButtonText` é oficialmente macOS; no Linux o efeito depende do servidor, então o timeout padrão é a rede de segurança final.
- Se houver evidência de que `close()` funciona num ambiente Linux, basta ajustar `canClose` em `main.ts`.

## Limites da detecção
- A resolução reativa depende de o Claude Code emitir hooks posteriores. Sem nenhum, o pedido só some por fim de sessão ou desconexão; o botão nativo cobre o resto.

## Testes
- `packages/desktop/test/lifecycle.test.ts` cobre resolvedIds, centro de notificações e fallback. E2E Electron (`e2e/desktop/desktop.spec.ts`, `packages/desktop/e2e/app.e2e.ts`) substitui `Notification.prototype.show/close` para registrar exibição e fechamento; exigem display/Electron e não rodam em ambiente headless sem xvfb.
