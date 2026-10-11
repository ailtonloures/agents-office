---
title: Polimento visual das modais "Hooks" e "Iniciar sessão" e feedback de clique nos botões
status: draft
labels: [needs-spec]
created: 2026-10-11
related: [desktop-app-permissions.prd.md, desktop-terminal-sessions.prd.md]
---

# PRD: Polimento visual das modais e dos botões

## Problem Statement
Ao abrir "Hooks do Claude Code" e "Iniciar sessão do Claude Code", o usuário vê itens e textos colados, uma modal de início de sessão que estoura a largura e mostra barra de rolagem horizontal, e botões sem nenhuma resposta visual ao clique.

## Solution
Reorganizar o conteúdo das duas modais em grids com espaçamento confortável, eliminar a rolagem horizontal e dar a todos os botões o comportamento tradicional: afundar ao pressionar e voltar ao soltar, com hover, foco e desabilitado visíveis. Fonte e paleta permanecem.

## User Stories
1. Como usuário, quero ver a lista de eventos de hooks com espaço entre marcador e nome, para ler cada item sem esforço.
2. Como usuário, quero os eventos em grade de duas colunas alinhadas, para comparar o que está instalado rapidamente.
3. Como usuário, quero a grade em uma coluna em telas estreitas, para não cortar texto.
4. Como usuário, quero o caminho do arquivo de settings legível e quebrado quando longo, para não alargar a modal.
5. Como usuário, quero margens internas maiores nas modais, para o conteúdo não encostar na borda.
6. Como usuário, quero botões de ação com espaço entre si, para não clicar no errado.
7. Como usuário, quero que o botão afunde ao clicar e volte ao soltar, para ter certeza de que o clique foi registrado.
8. Como usuário, quero que o botão fique mais claro ao passar o mouse, para saber que é clicável.
9. Como usuário de teclado, quero um contorno visível no foco, para navegar sem perder a posição.
10. Como usuário, quero botões desabilitados visivelmente apagados e sem efeito de clique, para entender que não estão disponíveis (inclui "Instalar/Remover hooks").
11. Como usuário, quero que a modal "Iniciar sessão" nunca tenha rolagem horizontal, para ela parecer acabada.
12. Como usuário, quero que caminhos longos de projeto quebrem em várias linhas, para ver o caminho inteiro sem estourar a largura.
13. Como usuário, quero que o seletor de sessão a retomar encolha com reticências quando o resumo é longo, para não empurrar o layout.
14. Como usuário, quero as opções (Nova, Continuar, Retomar) como cartões alinhados, com destaque na opção marcada, para ver qual está ativa.
15. Como usuário, quero o seletor de modo de permissão alinhado em grade com o rótulo, para ler o formulário de forma organizada.
16. Como usuário, quero notas e avisos com altura de linha confortável e quebra de palavras, para ler as explicações longas.
17. Como usuário, quero os botões finais (Iniciar, Novo projeto, VS Code, Cancelar) quebrando de linha quando faltar espaço, para nenhum sair da modal.
18. Como usuário, quero linhas da lista de projetos com mais respiro, para escolher o projeto com precisão.
19. Como usuário, quero o botão de estrela da lista sem o efeito de afundar, para ele continuar discreto.
20. Como usuário, quero que o visual dos botões seja igual nas duas modais e nos botões flutuantes, para a interface ser consistente.
21. Como usuário em tela estreita (~480px), quero ambas as modais utilizáveis sem corte.
22. Como mantenedor, quero o estilo de botão em um único módulo compartilhado, para não repetir CSS.
23. Como mantenedor, quero que os `data-testid` e textos existentes não mudem, para os testes atuais continuarem válidos.

## Implementation Decisions
- Criar um módulo de estilo de botão compartilhado (string CSS) usado pelas duas modais e pelos botões flutuantes; segue a convenção atual de CSS em string injetada, sem introduzir framework.
- Efeito de botão estilo pixel/3D: sombra sólida inferior de 3px; no `:active` o botão desce 3px e a sombra some; transição curta (~60ms) devolve ao soltar. Hover clareia o fundo; `:focus-visible` com contorno azul; `:disabled` com opacidade reduzida, sem sombra e sem efeito.
- O botão de estrela da lista de projetos fica fora do efeito.
- Modal de Hooks: lista de eventos vira grid de 2 colunas com `minmax(0,1fr)` e gaps; cada item como cartão com padding e borda lateral; 1 coluna abaixo de ~520px. O texto `[x] Evento` permanece idêntico (só espaçamento via CSS).
- Modal de Hooks: padding maior, margens verticais entre blocos, caminho com quebra livre, ações em flex com gap e wrap.
- Modal Iniciar sessão: caixa com `overflow-x` oculto, filhos com `min-width:0`/`max-width:100%`; caminho selecionado com quebra livre; select de sessão flexível com reticências; opções em grid de cartões com destaque no marcado; modo de permissão em grid rótulo+select; ações com wrap; mais respiro nas linhas da lista.
- Fonte, tamanhos e paleta inalterados.

## Testing Decisions
- Bom teste: observa comportamento externo (DOM, atributos, medidas renderizadas), não detalhes do CSS.
- Regressão por unidade: os testes Vitest existentes dos dois painéis (por `data-testid`/`textContent`) devem continuar passando sem alteração.
- Verificação de layout e interação por e2e com Playwright MCP: `scrollWidth === clientWidth` na caixa do picker com cwd e resumo de sessão longos, em 1280px e 480px; deslocamento vertical do botão com mouse pressionado; hover, foco e disabled.
- Prior art: testes de painel existentes em `packages/web` e specs e2e da skill qa, se o projeto os tiver.

## Out of Scope
Trocar fonte; mudar paleta ou tema; trocar para checkboxes reais ou alterar a semântica das listas; mudar comportamento/lógica das modais; estilizar terminal, toasts e `lostSessions` (podem adotar o botão compartilhado depois); extrair tokens CSS globais.

## Further Notes
Hoje não há `:hover/:active/transition` em nenhum botão do projeto. O módulo compartilhado deixa os outros painéis (`terminalPanel`, `lostSessions`) prontos para adotarem o mesmo efeito depois. Causas prováveis do scroll horizontal: caminho (`cwd`) sem quebra, `select` de sessão que não encolhe dentro de label flex, linha de ações sem wrap.
