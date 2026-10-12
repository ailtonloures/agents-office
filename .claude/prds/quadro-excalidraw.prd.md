---
title: Quadro branco interativo com Excalidraw
status: ready-for-agent
labels: [ready-for-agent, needs-spec]
created: 2026-10-11
related: [perfis-sessoes-gerenciadas.prd.md]
depends_on: [perfis-sessoes-gerenciadas.prd.md]
---

# PRD: Quadro branco interativo com Excalidraw

## Problem Statement

O quadro branco do escritório é só decoração de parede. Agentes não têm onde desenhar um diagrama, uma arquitetura ou um fluxo para explicar uma ideia, e o usuário não tem um espaço visual compartilhado com o time.

## Solution

O quadro branco do escritório vira um **objeto interativo**: o usuário o vê destacado como clicável e, ao clicar, abre um **Excalidraw em tela cheia** dentro do app. Há **um quadro por workspace**. Os agentes desenham nele por ferramentas MCP (elementos, diagramas Mermaid, bibliotecas de formas) e o usuário vê as mudanças aparecerem em tempo real e também pode desenhar. A cena fica salva e volta quando o projeto é reaberto.

## User Stories

1. Como desenvolvedor, quero que o quadro branco do escritório pareça clicável (destaque ao passar o mouse, cursor de mão, rótulo "Quadro — clique para abrir"), para saber que posso interagir.
2. Como desenvolvedor, quero clicar no quadro para abri-lo em tela cheia, para desenhar com espaço.
3. Como desenvolvedor, quero fechar o quadro com um botão e com Esc, para voltar ao escritório.
4. Como desenvolvedor, quero um único quadro por workspace, para ter um lugar claro de colaboração.
5. Como desenvolvedor, quero que o quadro abra rápido e que o app não fique mais lento no carregamento por causa dele, para manter a experiência atual.
6. Como desenvolvedor, quero usar as ferramentas normais do Excalidraw (formas, setas, texto, mão livre), para desenhar como no Excalidraw.
7. Como desenvolvedor, quero que o que desenhei fique salvo ao fechar e reabrir o quadro, para não perder trabalho.
8. Como desenvolvedor, quero que o quadro seja restaurado ao reabrir o app, para retomar de onde parei.
9. Como agente, quero `board_read` para ler os elementos atuais do quadro, para saber o que já existe.
10. Como agente, quero `board_add_elements` para adicionar formas, setas e textos descritos em JSON, para desenhar diagramas.
11. Como agente, quero `board_add_mermaid` para converter um diagrama Mermaid em elementos do quadro, para desenhar fluxos rapidamente.
12. Como agente, quero `board_clear` para limpar o que eu desenhei (ou o quadro todo, com aprovação), para recomeçar.
13. Como agente, quero posicionar novos elementos sem sobrepor o conteúdo existente, para não destruir o que já foi desenhado.
14. Como desenvolvedor, quero ver os elementos desenhados por agentes aparecerem em tempo real com o quadro aberto, para acompanhar o raciocínio.
15. Como desenvolvedor, quero ver qual agente desenhou o quê (por exemplo, cor ou rótulo de autoria), para entender a contribuição de cada um.
16. Como desenvolvedor, quero que minhas edições e as dos agentes se combinem sem perder desenhos, para trabalharmos juntos.
17. Como desenvolvedor, quero poder pedir a um agente "desenhe a arquitetura no quadro" e ver o resultado, para visualizar ideias.
18. Como desenvolvedor, quero carregar bibliotecas de formas do Excalidraw (`.excalidrawlib`), para ter ícones e formas prontas.
19. Como agente, quero usar formas das bibliotecas carregadas, para desenhar com os ícones do time.
20. Como desenvolvedor, quero exportar o quadro como imagem ou `.excalidraw`, para compartilhar fora do app.
21. Como desenvolvedor, quero importar um `.excalidraw`, para começar de um desenho existente.
22. Como desenvolvedor, quero que o conteúdo do quadro chegue aos agentes como dado, não como instrução, para evitar injeção de comandos via desenho.
23. Como desenvolvedor, quero que o quadro de um projeto não apareça em outro, para manter o isolamento.
24. Como desenvolvedor, quero que, quando um agente desenha, o avatar dele vá até o quadro, para a cena refletir a atividade.
25. Como desenvolvedor, quero ser avisado se a cena estiver corrompida e poder restaurar a última versão válida, para não perder tudo.
26. Como desenvolvedor, quero que o quadro tenha um limite de tamanho, para que um agente não o encha sem parar.
27. Como desenvolvedor, quero um quadro que funcione sem internet, para uso offline.

## Implementation Decisions

- **Um quadro por workspace**, guardado pelo processo principal do app em arquivo `.excalidraw` (JSON) na pasta de dados, com nome derivado do caminho do projeto. Escrita atômica, com uma cópia da última versão válida. Fora do repositório do usuário.
- **Agent Bus** expõe `board_read`, `board_add_elements`, `board_add_mermaid` e `board_clear`. Elementos chegam como descrição simplificada ("skeleton") e são convertidos para elementos completos do Excalidraw. Cada elemento criado por agente carrega metadado de autoria. `board_clear` limpa só o que o próprio agente desenhou por padrão; limpar tudo pede aprovação.
- **Posicionamento:** a ferramenta calcula uma área livre perto do conteúdo existente quando o agente não informa coordenadas.
- **Interatividade do objeto no jogo:** o prop de parede do quadro vira interativo, com destaque no hover, cursor de mão e rótulo explícito. Clique abre o overlay em tela cheia. Reaproveita a lógica de clique e de interação já usada em outros props e no Tech Lead.
- **Overlay em React isolado.** O front é Phaser com TypeScript puro; o `@excalidraw/excalidraw` é um componente React, então ele roda numa ilha React montada sob demanda num overlay HTML por cima do canvas, **carregada só ao abrir o quadro** para não pesar o splash. Funciona offline (fontes e bibliotecas empacotadas).
- **Sincronização.** O overlay e o processo principal trocam cenas pela ponte do preload. Alterações do usuário vão ao processo principal com debounce; alterações de agentes chegam ao overlay aberto em tempo real. O merge é por id de elemento, resolvido por `version`/`versionNonce` do Excalidraw.
- **"Plugins".** O Excalidraw não tem sistema de plugins. Na v1: conversão Mermaid (`mermaid-to-excalidraw`) e bibliotecas de formas (`.excalidrawlib`), com instalação em pasta de bibliotecas do app. Sem sistema de plugins próprio.
- **Segurança.** O conteúdo textual do quadro, ao ser lido por um agente, é rotulado como dado do usuário/outros agentes.
- **Limite:** número máximo de elementos e de bytes por cena.
- **Cena no jogo:** o avatar de um agente que desenha se desloca até o quadro (reaproveita o estado de visita do PRD de comunicação como destino de ponto de interesse).

## Testing Decisions

- Um bom teste verifica o resultado visível: a cena resultante após cada ferramenta, o arquivo persistido, o estado do overlay; não detalhes do componente do Excalidraw.
- Módulos testados: store da cena (leitura, escrita atômica, recuperação de corrompido, limites); conversão skeleton → elementos e posicionamento livre; merge por versão; ferramentas `board_*` via Agent Bus; conversão Mermaid; carregamento de bibliotecas; lógica de clique/hover do prop; carregamento lazy (o bundle principal não inclui o Excalidraw).
- Arte prévia: testes de `props`/`clickDecision`/`uiOverlay` do pacote web e E2E do escritório; E2E do desktop para abrir o quadro e ver um desenho de agente aparecer.

## Out of Scope

- Vários quadros por workspace.
- Colaboração multiusuário.
- Sistema de plugins próprio do Excalidraw.
- Quadro versionado no repositório.
- Reconhecimento de desenho pelos agentes além de ler a cena (JSON) e exportar imagem.

## Further Notes

- Inspiração: quadros/notas do canvas do Maestri.
