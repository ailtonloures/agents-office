---
title: Pedidos de permissão apenas notificam (decisão no terminal)
status: ready-for-agent
labels: [ready-for-agent, needs-spec]
created: 2026-10-11
related: [desktop-app-permissions.prd.md]
---

# PRD: Pedidos de permissão apenas notificam

## Problem Statement

Hoje, quando o Claude Code pede permissão, o app mostra um cartão com os botões **Aprovar**, **Negar** e **Terminal**, e o hook `PermissionRequest` fica bloqueado (até 24 h) esperando a decisão do app. O usuário prefere decidir sempre no terminal. O cartão é ruído, o hook bloqueante é frágil, e a notificação do sistema continua na tela mesmo depois que o usuário já respondeu no terminal.

## Solution

O app apenas **avisa**: notificação do sistema, balão `!` no personagem e contador na bandeja/HUD, como já existe, mas sem nenhum botão de decisão. O hook deixa de bloquear: o prompt aparece imediatamente no terminal. Quando o usuário aprova ou nega no terminal, o app percebe a resolução e **fecha a notificação**, o balão e o contador. Se o sistema não permitir fechar a notificação programaticamente, ela ganha um botão nativo "Fechar".

## User Stories

1. Como desenvolvedor, quero ser notificado quando o Claude Code pedir permissão, para saber que preciso voltar ao terminal.
2. Como desenvolvedor, quero que a notificação mostre a ferramenta e o resumo do comando, para saber do que se trata sem abrir o terminal.
3. Como desenvolvedor, quero que a notificação indique que a resposta é no terminal, para não procurar botões no app.
4. Como desenvolvedor, quero que nenhum cartão com Aprovar/Negar/Terminal apareça no escritório, para ter uma interface mais limpa.
5. Como desenvolvedor, quero que os atalhos Y/N/T deixem de existir no jogo, para não decidir sem querer.
6. Como desenvolvedor, quero que o prompt de permissão apareça no terminal imediatamente, sem esperar o app, para não sofrer atraso.
7. Como desenvolvedor, quero que o hook nunca bloqueie o Claude Code, mesmo com o app fechado ou o daemon fora do ar.
8. Como desenvolvedor, quero que a notificação desapareça quando eu aprovar no terminal, para não ficar com avisos obsoletos.
9. Como desenvolvedor, quero que a notificação desapareça também quando eu negar no terminal.
10. Como desenvolvedor, quero que a notificação desapareça quando a sessão terminar ou eu enviar outro prompt, para não sobrar aviso de pedido que não existe mais.
11. Como desenvolvedor, quero que o balão `!` do personagem continue aparecendo enquanto o pedido estiver pendente, para localizar o agente que espera.
12. Como desenvolvedor, quero que o balão `!` suma quando o pedido for resolvido no terminal.
13. Como desenvolvedor, quero que o contador de pendências na bandeja e no HUD continue funcionando e zere quando resolvido.
14. Como desenvolvedor, quero não receber notificação quando a janela do app está visível e focada, como hoje.
15. Como desenvolvedor, quero clicar na notificação para trazer a janela do app à frente, como hoje.
16. Como desenvolvedor, quero um botão "Fechar" na notificação caso o sistema não consiga fechá-la sozinho, para dispensá-la manualmente.
17. Como desenvolvedor com hooks já instalados, quero que a reinstalação remova o timeout antigo de 24 h do hook, sem refazer nada manualmente.
18. Como desenvolvedor, quero que a instalação de hooks continue registrando `PermissionRequest`, para continuar recebendo o aviso.
19. Como desenvolvedor, quero que dois pedidos simultâneos gerem duas notificações independentes, cada uma fechando sozinha quando resolvida.
20. Como desenvolvedor, quero que reconectar ao daemon não deixe notificações órfãs de pedidos já resolvidos.
21. Como desenvolvedor, quero que o texto do aviso sobre daemon externo não prometa mais "aprovar pela interface".
22. Como mantenedor, quero que o protocolo não aceite mais mensagens de decisão, para reduzir superfície e código morto.
23. Como mantenedor, quero README, PRD/specs anteriores e learnings refletindo o novo comportamento.

## Implementation Decisions

- **Hook CLI**: `PermissionRequest` passa a usar o mesmo envio rápido e sem saída dos demais eventos; nunca imprime decisão. Sem espera, sem tratamento de sinais dedicado.
- **Registro de hooks**: remove o timeout especial de 24 h; o evento continua registrado com matcher. A instalação/migração reescreve entradas antigas removendo o timeout.
- **Daemon**: a rota bloqueante de permissão é removida. O recebimento normal de hook, ao ver `PermissionRequest`, registra o pedido pendente e emite `permission.requested` aos clientes de UI. O broker vira um rastreador de pendências: mantém snapshot e resolução externa (eventos que indicam que o terminal respondeu ou a sessão acabou), emitindo `permission.resolved`. Removem-se decisão, liberação em massa e a lógica de "sem UI conectada".
- **Protocolo compartilhado**: remove decisão (allow/deny/defer), mensagem de decisão do cliente, parser de mensagens do cliente e formatação de saída do hook. Mantém pedido, snapshot e resolvido. O motivo de resolução deixa de distinguir UI/terminal.
- **Web**: remove o cartão de permissão, teclas, interação de ponteiro e estado de debug associados; remove o envio de decisão do cliente. Mantém fila de pendências, balão `!` e contagem no HUD.
- **Desktop**: o rastreador de permissões passa a informar também os ids resolvidos (por resolução, snapshot que os omite ou queda de conexão). O processo principal mantém um mapa id → notificação e fecha a notificação ao receber a resolução. Quando o fechamento programático não for suportado, a notificação usa botão nativo de fechar. A regra "não notificar com janela visível e focada" e o clique para mostrar a janela permanecem.
- **Texto**: a notificação indica resposta no terminal; o aviso de daemon externo é reescrito.
- **Compatibilidade**: hooks antigos (com espera) enviados a um daemon novo não podem travar; a rota antiga deve responder sem decisão imediatamente ou deixar de existir sem quebrar o terminal.

## Testing Decisions

- Bons testes verificam comportamento externo (mensagens no stream, notificações exibidas/fechadas, saída e timeout do hook), nunca estrutura interna.
- **Daemon (HTTP/WebSocket)**: pedido emite `permission.requested`; eventos do terminal emitem `permission.resolved`; snapshot para cliente novo; hook retorna rápido sem corpo de decisão; mensagens de decisão são ignoradas. Prior art: teste e2e de permissão do daemon.
- **Hooks CLI e merger**: `PermissionRequest` não bloqueia nem imprime; instalação não grava timeout; migração remove timeout antigo; idempotência. Prior art: testes de hooks CLI.
- **Rastreador/Watcher do desktop**: ids resolvidos corretos em resolução, snapshot e queda de conexão. Prior art: testes de ciclo de vida do desktop.
- **Ciclo de vida do desktop com Notification falsa**: pedido cria notificação; resolução fecha; sem notificação com janela focada; fallback com botão de fechar.
- **Shared e Web**: schemas sem decisão; fila de pendências, balão e contagem; ausência do cartão. Prior art: testes de lógica de permissão e do cliente.
- **E2E Playwright**: pedido simulado mostra balão/contador e nenhum cartão; resolução remove o balão. Prior art: e2e de permissões existente, reescrito.

## Out of Scope

- Aprovar/negar por qualquer meio fora do terminal (mobile, push, etc.).
- Mudanças nas sessões de terminal embutidas e em seus modos de permissão.
- Novo design de notificações (sons, agrupamento, ações customizadas além do botão de fechar).
- Windows.

## Further Notes

- A resolução reativa depende de o Claude Code emitir hooks posteriores (uso da ferramenta, negação, parada, novo prompt). Em casos sem nenhum desses eventos, o pedido só some por fim de sessão ou desconexão; o botão nativo de fechar cobre o resto.
- Este PRD substitui a parte de "responder permissões pela UI" de `desktop-app-permissions.prd.md` (histórias de aprovação), mantendo o restante do app desktop.
