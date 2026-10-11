# PRD — Terminal sem corte no rodapé e scrollbars estilizados

## Problem Statement
Ao abrir o terminal, o final dele (última linha e borda inferior) aparece cortado no rodapé da janela. Além disso, todas as barras de rolagem da aplicação usam o visual padrão do navegador, que destoa da interface. O pior caso é a barra de abas do terminal: quando o espaço encurta, aparece uma barra horizontal grossa e feia que ainda aperta as abas.

## Solution
O terminal sempre cabe inteiro na área visível, em qualquer dock e em janelas baixas ou estreitas, e se reajusta sozinho quando o espaço muda. Todas as barras de rolagem passam a ser finas e seguem a paleta da aplicação. A barra de abas rola sem exibir barra nativa e mantém a aba ativa sempre visível.

## User Stories
1. Como usuário, quero ver a última linha do terminal inteira ao abri-lo, para ler o que acabou de ser impresso.
2. Como usuário, quero que a borda inferior do painel apareça completa, para que a interface pareça acabada.
3. Como usuário, quero que o terminal se reajuste ao mudar de dock (baixo, esquerda, direita), sem cortes.
4. Como usuário, quero que o terminal se reajuste ao arrastar a borda do painel, sem cortar linhas.
5. Como usuário, quero que o terminal se reajuste ao minimizar e reabrir, sem cortes.
6. Como usuário, quero que o painel nunca ultrapasse a janela, mesmo com altura ou largura pequenas.
7. Como usuário, quero que o escritório mantenha um espaço mínimo útil quando o painel crescer.
8. Como usuário, quero barras de rolagem finas e discretas em toda a aplicação.
9. Como usuário, quero que as barras de rolagem usem as cores da aplicação, para um visual coeso.
10. Como usuário, quero que a rolagem do histórico do terminal use a mesma barra fina.
11. Como usuário, quero que o modal de configurações e a lista de projetos usem a mesma barra fina.
12. Como usuário, quero que a barra de abas não mostre barra horizontal grossa quando houver muitas abas.
13. Como usuário, quero rolar as abas com a roda do mouse, para alcançar abas fora da vista.
14. Como usuário, quero que a aba ativa fique sempre visível, mesmo sem barra de rolagem.
15. Como usuário, quero que os botões da barra (foco, VS Code, dock, minimizar) nunca sejam espremidos ou escondidos pelas abas.
16. Como usuário, quero que a altura da barra de abas não mude quando há muitas abas.
17. Como desenvolvedor, quero um único estilo de scrollbar compartilhado, para ajustá-lo em um só lugar.
18. Como desenvolvedor, quero que o limite de tamanho do painel seja uma função pura testável.

## Implementation Decisions
- O terminal observa o tamanho do seu contêiner e reajusta as colunas e linhas, agrupado em no máximo um ajuste por frame, em vez de depender só do evento de janela.
- Após abrir, expandir, trocar de dock ou aplicar o layout do painel, o ajuste do terminal roda depois do layout final.
- O painel do terminal nunca excede o espaço do contêiner (altura no dock inferior, largura nos docks laterais) e corta o excesso internamente.
- O limite de altura e largura do painel dá prioridade ao espaço mínimo do escritório; o mínimo do painel não pode empurrá-lo para além da janela.
- O contêiner do terminal ganha uma pequena folga inferior para a última linha não encostar na borda.
- Um módulo compartilhado define o estilo de scrollbar fino (cores da paleta existente, estados de hover e ativo) e é aplicado globalmente, cobrindo o histórico do terminal e os painéis modais.
- A barra de abas esconde a scrollbar nativa, converte a roda vertical em rolagem horizontal e rola a aba ativa para a vista após cada renderização.
- Os demais itens da barra de abas não encolhem; só a área de abas encolhe e rola.

## Testing Decisions
- Bons testes verificam comportamento externo (valores retornados, estilo produzido, abas visíveis), não detalhes de implementação.
- Testes unitários nas funções puras de limite de tamanho do painel: janelas baixas e estreitas, valores mínimos e máximos, docks.
- Teste unitário no módulo de estilo de scrollbar: contém regras para o padrão moderno e o fallback WebKit, e a variante sem barra para as abas.
- Verificação visual e2e com Playwright (skill qa): rodapé do terminal visível em cada dock, janela baixa, muitas abas.
- Prior art: testes existentes de `terminalTabs` e da sequência de specs 040–046.

## Out of Scope
- Redesenhar a barra de abas além da rolagem e visibilidade.
- Mudar a paleta ou o tema do xterm.
- Alterar o comportamento de docks, atalhos ou persistência do painel.
- Estilizar barras de rolagem fora desta aplicação web.

## Further Notes
- As causas do corte foram identificadas lendo o código e ainda precisam ser confirmadas visualmente na spec 047, antes de aplicar as correções.
- Registrar o aprendizado em `.claude/learnings/terminal-layout.md`.
