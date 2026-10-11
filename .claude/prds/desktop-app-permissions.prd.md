---
title: Agents Office Desktop: app Electron com aprovação de permissões do Claude Code
status: draft
labels: [needs-spec]
created: 2026-10-10
related: [agents-office.prd.md, desktop-terminal-sessions.prd.md]
---

# PRD: Agents Office Desktop e aprovação de permissões

> **Nota de substituição:** a parte de "responder permissões pela UI" (cartão Aprovar/Negar/Terminal, atalhos, hook bloqueante de 24 h) foi substituída por [permission-notify-only.prd.md](permission-notify-only.prd.md): o app só avisa (notificação, balão `!`, contador) e a decisão é sempre no terminal; a notificação fecha sozinha quando o pedido é resolvido lá. O restante deste PRD (app Electron, bandeja, daemon embutido, instalação de hooks) continua válido.

## Problem Statement

O Agents Office hoje roda como um daemon avulso (`npx agents-office`) e uma aba de navegador. Isso obriga o usuário a lembrar de iniciar o processo, manter um terminal ocupado e uma aba aberta, e não há um "lugar" único e nomeado onde o escritório viva. Além disso, quando o Claude Code precisa de permissão para executar algo (um `Bash`, uma edição), o escritório só **mostra** que o agente está aguardando (balão `!`); a resposta continua sendo dada no terminal onde aquela sessão roda. O usuário vê o problema no escritório, mas precisa trocar de janela para resolvê-lo.

## Solution

Um app desktop Electron (Linux e macOS) que empacota o core existente (daemon, shared, web) e o mantém rodando num só lugar, com ícone na bandeja, janela própria e instalação de hooks pelo app. A primeira capacidade nova é **responder às solicitações de permissão do Claude Code pela UI**: quando uma sessão pede permissão, o personagem mostra o balão `!` e um cartão sobre o escritório exibe a ferramenta, o comando e o projeto, com os botões **Aprovar**, **Negar** (com motivo opcional) e **Deixar para o terminal**. A decisão volta ao Claude Code por um hook `PermissionRequest`, que fica esperando a resposta de forma indeterminada, como o prompt do terminal faria. Se o app estiver fechado ou a conexão cair, o hook sai sem decisão e o prompt normal do terminal assume.

## User Stories

### App e ciclo de vida
1. Como desenvolvedor, quero abrir o Agents Office como um app desktop, para não precisar de terminal nem de navegador.
2. Como desenvolvedor, quero que o app suba o daemon sozinho, para que os hooks sempre encontrem o servidor.
3. Como desenvolvedor, quero que fechar a janela mantenha o app na bandeja com o daemon rodando, para continuar recebendo eventos e pedidos de permissão.
4. Como desenvolvedor, quero um menu "Sair" explícito na bandeja que encerra tudo, para ter controle de quando o app para.
5. Como desenvolvedor, quero que apenas uma instância do app exista, e que abrir de novo traga a janela existente à frente.
6. Como desenvolvedor, quero que o app se conecte a um daemon `agents-office` standalone que já esteja na porta, em vez de falhar, e me avise do que isso implica.
7. Como desenvolvedor, quero que um crash do daemon não derrube a janela, e que o app reinicie o daemon e avise.
8. Como desenvolvedor, quero instalar, ver o status e remover os hooks pela interface do app, para não depender do CLI.
9. Como desenvolvedor, quero que o app use os mesmos hooks e a mesma porta (4777) do CLI atual, para que quem já instalou os hooks não precise refazer nada.

### Aprovação de permissões
10. Como desenvolvedor, quero ver no escritório quando uma sessão ou subagente aguarda minha permissão, e qual personagem é, para saber a quem o pedido pertence.
11. Como desenvolvedor, quero um cartão com ferramenta, comando/arquivo resumido e projeto, para decidir sem abrir o terminal.
12. Como desenvolvedor, quero **Aprovar** uma solicitação com um clique, para o Claude Code seguir imediatamente.
13. Como desenvolvedor, quero **Negar** uma solicitação, com um motivo opcional que volta ao Claude como feedback.
14. Como desenvolvedor, quero **Deixar para o terminal**, para liberar o pedido e responder no prompt normal.
15. Como desenvolvedor, quero que vários pedidos simultâneos (sessões paralelas) formem uma fila visível, sem perder nenhum.
16. Como desenvolvedor, quero uma notificação do sistema quando chegar um pedido e a janela não estiver em foco, para não deixar o Claude parado sem perceber.
17. Como desenvolvedor, quero que o pedido espere minha resposta sem prazo curto, como o terminal esperaria.
18. Como desenvolvedor, quero que, se o app fechar ou a conexão cair com pedidos pendentes, o terminal receba o prompt normal, para nunca deixar uma sessão presa.
19. Como desenvolvedor, quero que ferramentas que minhas regras já permitem **não** apareçam como pedidos, para não ter fila desnecessária.
20. Como desenvolvedor, quero ver no cartão qual agente fez o pedido (Tech Lead ou subagente), para entender o contexto.

### Segurança e limites
21. Como desenvolvedor, quero que somente a UI do app consiga decidir um pedido, e que um `POST /hook` comum nunca aprove nada, para que outro processo local não aprove ações em meu nome.
22. Como desenvolvedor, quero que o app nunca altere minhas regras de permissão (sem "sempre permitir" nesta versão), para manter o controle total delas.
23. Como desenvolvedor, quero que, se nenhuma UI estiver conectada ao daemon, o hook libere o pedido na hora para o terminal, em vez de ficar pendurado.

## Implementation Decisions

### Decisões já tomadas
- **Electron** (não Tauri): o daemon já é Node; o pty (PRD seguinte) usa `node-pty`; sem sidecar.
- **Plataformas**: Linux (AppImage e `.deb`) e macOS (`.dmg`). Windows fica fora. Sem assinatura/notarização e sem atualização automática na v1 (premissa a confirmar; se for necessário distribuir publicamente, vira item próprio).
- **Daemon embutido como processo filho** (`utilityProcess` do Electron), na porta 4777; `requestSingleInstanceLock`; se a porta já está ocupada por um daemon `agents-office`, o app conecta nele e informa que a aprovação pela UI passa a depender daquele daemon.
- **Fechar a janela = bandeja**, com o daemon ativo; "Sair" encerra o app e o daemon.
- **Evento de permissão**: hook `PermissionRequest` (não `PreToolUse`). Dispara apenas quando o Claude Code ia perguntar ao usuário, então ferramentas já permitidas não geram fila. `PreToolUse` fica como possível modo futuro.
- **Espera indeterminada**: o hook segura a conexão até a resposta, sem prazo curto. O `hooks install` grava um `timeout` alto nesse hook específico. Se o limite do Claude Code estourar, o fluxo normal de permissão continua (falha segura).
- **Respostas**: Aprovar, Negar (motivo opcional) e Deixar para o terminal. Sem "sempre permitir" e sem editar o input nesta versão.

### Módulos
- **shared**: novos tipos `PermissionRequest` (id, sessionId, actorId, tool, resumo do input, ts) e `PermissionDecision` (`allow` | `deny{message?}` | `defer`), e mensagens de protocolo `permission.requested`, `permission.resolved` e `permission.decide` (esta enviada pela UI). O `OfficeModel` ganha a lista de pedidos pendentes.
- **daemon**:
  - **PermissionBroker** (novo, módulo profundo): guarda a fila de pedidos pendentes, mantém as conexões HTTP dos hooks abertas, resolve uma pendência quando chega a decisão da UI, e libera todas as pendências (sem decisão) quando nenhuma UI está conectada ou quando a conexão do hook cai.
  - **HookReceiver**: nova rota `POST /hook/permission` (long-poll) separada da rota rápida `/hook` (que continua respondendo 204 de imediato).
  - **StreamServer**: aceita `permission.decide` somente de clientes de UI do WS; `POST` de hook nunca decide.
  - **SettingsMerger**: inclui o evento `PermissionRequest` com timeout alto; instala/desinstala de forma idempotente e reversível como os demais; comando de hook dedicado para esse evento.
- **cli (`hook`)**: para `PermissionRequest`, lê o stdin, faz POST em `/hook/permission`, **espera sem timeout curto**, e imprime o JSON de decisão no stdout (`hookSpecificOutput.decision.behavior = allow|deny`, com `message` no deny). Daemon desligado, sem UI ou erro: exit 0 sem saída (o Claude Code pergunta no terminal). O caminho rápido dos demais eventos permanece com timeout de 300 ms.
- **web**: **PermissionCard** (cartão com a fila, os três botões e o campo de motivo do Deny), indicação no personagem solicitante e atualização do HUD (`! n` passa a contar também pedidos pendentes).
- **desktop** (novo pacote `packages/desktop`): processo principal Electron (janela, bandeja, single-instance, notificações, gerência do daemon filho), preload mínimo e empacotamento com `electron-builder`. Reaproveita o build do `packages/cli` e `packages/web`.

### Premissas a validar antes dos specs
- Que o formato `hookSpecificOutput` do `PermissionRequest` (`decision.behavior`, `message` no deny) é o documentado, testando em uma sessão real.
- Que, enquanto o hook segura a conexão, o prompt do terminal não aparece, e que ele reaparece ao liberar (sem decisão).
- Qual o maior `timeout` aceito pelo Claude Code para um hook de comando.
- Que o payload do `PermissionRequest` identifica sessão e, quando aplicável, o subagente solicitante.

## Testing Decisions

- Um bom teste exercita o comportamento externo pela seam mais alta, com payloads reais e saídas observáveis.
- **Seam 1 (daemon)**: `POST /hook/permission` com UI conectada → o cliente WS recebe `permission.requested` → enviar `permission.decide` → a resposta HTTP traz o JSON correto (allow, deny com mensagem). Cenários: dois pedidos simultâneos; UI desconecta com pedido pendente (liberação sem decisão); nenhuma UI conectada (liberação imediata); hook desconecta (pendência removida); `POST /hook` comum nunca resolve um pedido.
- **Seam 3 (CLI de hooks)**: install/uninstall com `HOME` temporário incluindo o novo evento e o timeout alto, byte a byte idêntico ao original após o uninstall; o comando `hook` de permissão imprime exatamente o JSON esperado e sai com 0 sem saída quando o daemon está fora.
- **Seam 4 (E2E Playwright)**: pedido pendente aparece como cartão e `! n` no HUD; clicar Aprovar/Negar/Deixar resolve e remove o cartão.
- **Electron**: testes de fumaça com Playwright para Electron (abre janela, daemon sobe, fechar a janela mantém o processo, "Sair" encerra tudo). Verificação manual em Linux e macOS antes de liberar.
- Prior art: `daemon.e2e.test.ts` (Seam 1) e `hooks-cli.test.ts` (Seam 3) do projeto.

## Out of Scope

- Windows.
- "Sempre permitir" (gravar regra de permissão) e edição do input antes de aprovar.
- Modo que intercepta toda chamada de ferramenta (`PreToolUse`).
- Assinatura de código, notarização do macOS e atualização automática (na v1).
- Responder `AskUserQuestion`/`ExitPlanMode` pela UI.
- Terminal embutido e iniciar sessões pelo app: veja `desktop-terminal-sessions.prd.md`.
- Acesso remoto/multiusuário.

## Further Notes

- Este PRD **substitui** as restrições "UI somente leitura" e "Controlar agentes pela UI" do PRD original, apenas para a aprovação de permissões; o restante do escritório continua passivo.
- A segurança depende de o daemon escutar só em 127.0.0.1 (já garantido) e de decisões só valerem vindas do WS de UI. Considerar um token efêmero entre o app Electron e o daemon filho, para que uma aba de navegador comum não consiga decidir pedidos.
- O formato dos hooks e dos transcripts do Claude Code não é uma API estável. Manter fixtures versionadas e validar as premissas acima antes de escrever os specs.
- Ordem sugerida de specs: (1) PermissionBroker + rota + protocolo no daemon; (2) `hook`/SettingsMerger com `PermissionRequest`; (3) PermissionCard na web; (4) pacote desktop (janela, daemon filho, bandeja, single-instance); (5) instalação de hooks pela UI; (6) empacotamento Linux/macOS e E2E.
