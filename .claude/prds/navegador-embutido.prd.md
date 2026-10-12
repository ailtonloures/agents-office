---
title: Navegador embutido controlado por agentes
status: ready-for-agent
labels: [ready-for-agent, needs-spec]
created: 2026-10-11
related: [perfis-sessoes-gerenciadas.prd.md]
depends_on: [perfis-sessoes-gerenciadas.prd.md]
---

# PRD: Navegador embutido controlado por agentes

## Problem Statement

Agentes que precisam testar uma interface web, consultar documentação ou preencher um formulário dependem de ferramentas externas, e o usuário não vê o que o agente está fazendo no navegador. Também não há como o usuário apontar um elemento de uma página e entregá-lo como contexto ao agente.

## Solution

O app ganha um **navegador embutido** (uma aba do dock, ao lado dos terminais), com **um navegador por workspace** compartilhado pelos agentes do projeto. Os agentes o controlam por ferramentas MCP (navegar, ler a página, clicar, digitar, capturar tela, ler o console). O usuário vê tudo em tempo real, pode assumir o controle a qualquer momento, pausar os agentes e **selecionar um elemento da página para injetar seu contexto** (seletor, texto, HTML, captura) no terminal de um agente.

## User Stories

1. Como desenvolvedor, quero uma aba "Navegador" no dock, para ver o navegador do projeto junto dos terminais.
2. Como desenvolvedor, quero usar o navegador com mouse e teclado (barra de endereço, voltar, avançar, recarregar), para navegar como num navegador comum.
3. Como desenvolvedor, quero um navegador por workspace, para que cada projeto tenha o seu contexto.
4. Como desenvolvedor, quero que os cookies e logins do navegador fiquem salvos por projeto e separados do app e do meu Chrome, para não expor minhas contas.
5. Como agente, quero `browser_navigate(url)`, para abrir uma página.
6. Como agente, quero `browser_snapshot`, que devolve a árvore de acessibilidade da página com referências de elementos, para entender a página sem enxergar pixels.
7. Como agente, quero `browser_click(ref)`, para clicar num elemento.
8. Como agente, quero `browser_type(ref, text)` e `browser_press_key`, para preencher campos e acionar atalhos.
9. Como agente, quero `browser_screenshot`, para ver a página.
10. Como agente, quero `browser_console`, para ler erros e logs.
11. Como agente, quero `browser_eval(js)`, para inspecionar ou manipular a página quando preciso.
12. Como agente, quero `browser_wait_for`, para esperar um elemento ou texto.
13. Como desenvolvedor, quero que as ações de vários agentes sejam executadas em fila, para que dois agentes não briguem pelo mesmo clique.
14. Como desenvolvedor, quero ver qual agente está usando o navegador no momento, para saber quem faz o quê.
15. Como desenvolvedor, quero ver na página um indicador do elemento onde o agente vai agir, para acompanhar.
16. Como desenvolvedor, quero um botão "Pausar agentes" que bloqueie as ferramentas `browser_*` até eu liberar, para assumir o controle.
17. Como desenvolvedor, quero usar o navegador manualmente sem que o agente interfira enquanto estiver pausado, para trabalhar com segurança.
18. Como desenvolvedor, quero ser perguntado antes de downloads, para evitar arquivos indesejados.
19. Como desenvolvedor, quero ser perguntado quando um site pede permissões (câmera, microfone, localização, notificações), para decidir.
20. Como desenvolvedor, quero ser perguntado antes que um agente execute JavaScript arbitrário na página, para evitar abusos.
21. Como desenvolvedor, quero que o conteúdo das páginas chegue ao agente rotulado como dado não confiável, para reduzir o risco de prompt injection.
22. Como desenvolvedor, quero um botão "Selecionar elemento" que destaque o elemento sob o mouse, para apontar o que me interessa.
23. Como desenvolvedor, quero clicar num elemento destacado e escolher para qual agente enviar, para entregar contexto.
24. Como desenvolvedor, quero que o contexto enviado inclua seletor, texto, HTML do elemento e uma captura, para o agente entender onde está.
25. Como desenvolvedor, quero que esse contexto seja injetado no terminal do agente já formatado e rotulado, para ele usar de imediato.
26. Como desenvolvedor, quero revisar e editar o contexto antes de enviar, para remover dados sensíveis.
27. Como desenvolvedor, quero que o avatar do agente que usa o navegador reaja (por exemplo, olhe para o computador), para a cena refletir a atividade.
28. Como desenvolvedor, quero que o navegador funcione sem instalar nada além do app, para não depender de ferramentas externas.
29. Como desenvolvedor, quero limpar os dados de navegação do projeto, para recomeçar do zero.
30. Como desenvolvedor, quero que o navegador não persista entre projetos nem vaze páginas para outros, para manter isolamento.
31. Como desenvolvedor, quero mensagens claras quando uma ferramenta falha (página não carregou, elemento não achado), para o agente se recuperar.
32. Como desenvolvedor, quero que fechar a aba do navegador não encerre a sessão dos agentes, para não perder trabalho.

## Implementation Decisions

- **`WebContentsView` no processo principal**, um por workspace, com `session`/partition própria e persistente por projeto (cookies e armazenamento isolados do app e do Chrome do usuário). A aba entra no modelo do painel/dock existente.
- **Controle por CDP** (`webContents.debugger`) no processo principal, sem dependência adicional. Ferramentas `browser_*` expostas pelo Agent Bus: `navigate`, `snapshot`, `click`, `type`, `press_key`, `screenshot`, `console`, `eval`, `wait_for`.
- **Snapshot** baseado na árvore de acessibilidade, com referências estáveis dentro do snapshot. Captura de tela como imagem.
- **Fila de ações** por workspace, que serializa chamadas de vários agentes; cada ação registra o agente autor.
- **Confirmações** (cartão Permitir/Negar, no mesmo padrão dos demais cartões do app) para: downloads, pedidos de permissão do site e `browser_eval`. Navegar, ler e clicar são livres.
- **Pausar agentes:** interruptor por workspace; enquanto ativo, as ferramentas `browser_*` devolvem erro "pausado pelo usuário".
- **Conteúdo não confiável:** todo texto proveniente da página (snapshot, console, eval) é entregue ao agente rotulado como dado de terceiros.
- **Captura de contexto (seletor de elemento).** Um modo de seleção injeta no navegador um destacador; ao clicar, o app coleta seletor, texto, HTML (truncado) e captura do elemento, mostra uma prévia editável e envia ao agente escolhido, escrevendo no terminal dele com formatação e rótulo padronizados, ao estilo do Orca e do Maestri.
- **Isolamento.** Sem acesso aos cookies do Chrome do usuário. Limpar dados do projeto disponível na UI.
- **Cena.** Evento de uso do navegador chega ao renderer para o avatar do agente reagir.
- **Plataformas:** Linux e macOS.

## Testing Decisions

- Um bom teste verifica o efeito: o que a ferramenta devolve, o que aparece no navegador, o que é perguntado ao usuário e o que chega ao PTY; não detalhes do CDP.
- Módulos testados: fila de ações (ordem, autor, pausa); montagem do snapshot a partir de árvore de acessibilidade falsa; confirmações (negar/permitir, rótulos); isolamento de partition por projeto; seletor de elemento (coleta, truncamento, formatação do contexto); integração das ferramentas `browser_*` com um driver CDP falso.
- Arte prévia: testes de `sessionManager` com PTY falso, de IPC (`ipc.ts`, `terminalChannels`) e E2E de desktop (`packages/desktop/e2e`) apontando para uma página local de teste.

## Out of Scope

- Um navegador por agente e várias abas na v1.
- Usar o Chrome do usuário ou extensões.
- Dispositivos Android (existe no Maestri, não aqui).
- Gravação de vídeo e extensões do navegador.
- Windows.

## Further Notes

- Inspiração: skill `maestri-portal`, e o seletor de elementos do Orca/Maestri.
