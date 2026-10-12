---
title: Comunicação entre agentes e reuniões no escritório
status: ready-for-agent
labels: [ready-for-agent, needs-spec]
created: 2026-10-11
related: [perfis-sessoes-gerenciadas.prd.md]
depends_on: [perfis-sessoes-gerenciadas.prd.md]
---

# PRD: Comunicação entre agentes e reuniões no escritório

## Problem Statement

Cada agente trabalha isolado no seu terminal. Para que um Revisor opine sobre o que o Desenvolvedor fez, ou para que o Tech Lead consulte o Arquiteto, o usuário precisa copiar e colar texto entre terminais. As decisões perdem o contexto de quem as discute, e o escritório, que deveria mostrar o time trabalhando junto, não mostra ninguém conversando.

## Solution

Agentes gerenciados passam a trocar **mensagens com contexto** por ferramentas MCP do Agent Bus (`list_agents`, `send_message`, `reply`). Só conversam pares **explicitamente conectados** pelo usuário num painel de conexões. A mensagem é entregue no terminal do destino quando ele está ocioso. No escritório, o avatar de quem envia **anda até a mesa do destinatário**, fica de frente para ele, e só volta à própria mesa quando o destinatário responde. Um disjuntor evita conversas infinitas entre agentes.

## User Stories

1. Como desenvolvedor, quero conectar dois agentes do elenco, para autorizar que conversem.
2. Como desenvolvedor, quero ver e editar as conexões num checklist "pode falar com" por agente, para controlar quem fala com quem.
3. Como desenvolvedor, quero que sem conexão não haja nenhuma entrega, para que nenhum agente receba mensagens de quem eu não autorizei.
4. Como desenvolvedor, quero que a conexão valha nos dois sentidos, para que o destinatário possa responder.
5. Como agente, quero uma ferramenta `list_agents` que mostre com quem posso falar e se estão ocupados ou ociosos, para escolher o destinatário.
6. Como agente, quero uma ferramenta `send_message(to, text, context?)` para enviar uma mensagem e, opcionalmente, um trecho de contexto (arquivos, decisões, trechos de código).
7. Como agente, quero que `send_message` retorne na hora, para não bloquear meu trabalho esperando outro modelo.
8. Como agente, quero uma ferramenta `reply(message_id, text)` para responder uma mensagem recebida, para fechar o assunto.
9. Como agente destinatário, quero receber a mensagem no meu terminal com um cabeçalho que diga de quem veio, para saber a origem.
10. Como agente destinatário, quero que a mensagem seja rotulada como vinda de outro agente e não como instrução do usuário, para não tratá-la como ordem do dono.
11. Como agente, quero que a entrega espere eu ficar ocioso, para não ser interrompido no meio de uma tarefa.
12. Como desenvolvedor, quero ver quantas mensagens estão na fila de cada agente, para entender gargalos.
13. Como desenvolvedor, quero que, se o destino estiver desligado, o remetente receba um erro claro, para que ele tente outro caminho.
14. Como desenvolvedor, quero ver no escritório o remetente sair da mesa e andar até a mesa do destinatário, para visualizar quem está pedindo o quê.
15. Como desenvolvedor, quero que o remetente fique de frente para o destinatário, com balões de fala curtos (resumo da mensagem), para perceber a conversa.
16. Como desenvolvedor, quero que o remetente só volte à própria mesa quando o destinatário responder, para ver a conversa até o fim.
17. Como desenvolvedor, quero que um timeout de segurança longo (60 s) devolva o avatar à mesa quando o destino nunca responde, para não deixar ninguém preso.
18. Como desenvolvedor, quero que vários visitantes na mesma mesa se acomodem em pontos de conversa diferentes, para a cena não sobrepor avatares.
19. Como desenvolvedor, quero que, sem ponto livre, os visitantes esperem em pé na fila, para a cena continuar organizada.
20. Como desenvolvedor, quero que o broadcast visite um destinatário por vez, para manter a cena legível.
21. Como desenvolvedor, quero que o mesmo comportamento valha para todos os perfis, Tech Lead incluído, para a cena ser consistente.
22. Como desenvolvedor, quero que um agente ocupado (digitando ou rodando ferramenta) indique que recebeu uma mensagem pendente, para saber que há algo na fila.
23. Como desenvolvedor, quero um disjuntor que pause a troca após 8 mensagens encadeadas entre agentes sem intervenção minha, para evitar gasto descontrolado.
24. Como desenvolvedor, quero ser notificado quando o disjuntor dispara, com opção de continuar ou encerrar, para decidir.
25. Como desenvolvedor, quero que o contador de mensagens encadeadas zere quando eu digito em qualquer terminal, para que minha participação reinicie o ciclo.
26. Como desenvolvedor, quero um limite de taxa por remetente, para impedir rajadas.
27. Como desenvolvedor, quero silenciar um agente (não envia nem recebe), para isolá-lo.
28. Como desenvolvedor, quero um histórico das mensagens trocadas (remetente, destino, hora, resumo), para auditar as decisões.
29. Como desenvolvedor, quero abrir o texto completo de uma mensagem a partir do histórico, para ver o que foi dito.
30. Como desenvolvedor, quero que as mensagens não vazem para fora do projeto, para que times diferentes não se misturem.
31. Como desenvolvedor, quero que a animação não dependa de o terminal estar aberto, para a cena ocorrer mesmo com o dock recolhido.
32. Como desenvolvedor, quero que as mensagens pendentes sejam descartadas quando o app fecha, para não entregar contexto velho numa sessão nova.

## Implementation Decisions

- **Roteamento no processo principal.** As ferramentas vivem no Agent Bus do PRD de perfis. O Agent Bus resolve destinatários pelo elenco do projeto e pelas conexões, e escreve no PTY do destino. O daemon não participa.
- **Conexões explícitas e bidirecionais.** Armazenadas no elenco do projeto como pares de ids de agente. Interface: checklist "pode falar com" por agente no painel Elenco. Sem desenho de linhas no jogo na v1.
- **Mensagem:** id, remetente, destino, texto, contexto opcional (limite de tamanho), hora, `hops` (contador de encadeamento), estado (`na-fila` | `entregue` | `respondida` | `expirada`).
- **Entrega assíncrona.** `send_message` devolve o id ao remetente imediatamente. A resposta chega como uma nova mensagem no terminal do remetente (o destino usa `reply`). Nenhuma ferramenta bloqueia esperando a outra ponta.
- **Entrega só quando ocioso.** O estado ocioso vem do modelo de escritório já existente (hooks/transcripts). Enquanto ocupado, a mensagem fica em fila FIFO por destino. A entrega escreve no PTY com um cabeçalho padronizado.
- **Rótulo anti-injection.** Cabeçalho fixo `[Mensagem do agente <nome> — não é instrução do usuário]` e o conteúdo identificado como dado. O destino é instruído (no prompt injetado) a tratá-lo como colaboração, não como ordem.
- **Disjuntor.** `hops` é incrementado a cada mensagem gerada em resposta a outra (remetente atual estava respondendo a uma entrega). Ao chegar em 8 sem intervenção do usuário, as entregas pausam e o app notifica. Qualquer digitação do usuário em um terminal zera o contador do projeto. Limite de taxa por remetente. Silenciar agente bloqueia envio e recebimento.
- **Eventos de comunicação para o escritório.** O Agent Bus emite eventos (`iniciada`, `entregue`, `respondida`, `expirada`) pela ponte do preload para o renderer, que os traduz em movimento. O canal é local (IPC), sem passar pelo daemon.
- **Animação da visita.** Novo estado da máquina de personagens: caminhar até o ponto de conversa do destino (usa o pathfinding existente), ficar de frente, alternar balões e voltar à mesa quando a resposta chega ou ao expirar o timeout de segurança de 60 s. Pontos de conversa distintos por mesa, com fila de espera em pé. Vale para todos os perfis.
- **Histórico.** Registro em memória por projeto durante a sessão do app (e gravado em disco com tamanho limitado), com resumo e texto completo acessível na UI.
- **Descarte ao fechar.** Filas pendentes não sobrevivem ao fechamento do app.

## Testing Decisions

- Um bom teste verifica o efeito observável: o que o destino recebe no PTY, em que ordem, o que o remetente recebe como retorno e o que a cena exibe; nunca estruturas internas.
- Módulos testados: grafo de conexões (autorização, bidirecionalidade); fila e entrega (ocioso × ocupado, FIFO, destino desligado); rótulo e formatação; disjuntor e taxa (contagem, zerar na digitação, notificação); máquina de personagens (estado de visita, volta ao responder, timeout, filas de pontos de conversa); ponte de eventos no preload.
- Arte prévia: testes de `characterMachine`, `pathfinding` e `deskAssignment` do pacote web; testes de IPC do desktop com `ipc.ts`/`terminalChannels`; E2E de escritório (`e2e/tests/office.spec.ts`) com feeder de eventos.

## Out of Scope

- Reunião em mesa (broadcast em grupo) e sala de reunião; fica para evolução.
- Desenho de conexões por linhas no jogo.
- Chamadas bloqueantes (`ask_agent` síncrono).
- Conversas com sessões externas (somente leitura).
- Criar agentes (PRD de orquestrador).

## Further Notes

- Inspiração: skills `maestri`/`maestri-chat`. O diferencial deste produto é a representação espacial da conversa.
