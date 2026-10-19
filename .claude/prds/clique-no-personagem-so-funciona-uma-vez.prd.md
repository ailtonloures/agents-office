---
title: Clique no personagem só funciona uma vez
status: ready-for-agent
labels: [ready-for-agent, needs-spec, bug]
created: 2026-10-18
related: [cenario-responsivo-terminal-ultrawide.prd.md]
---

# PRD: Clique no personagem só funciona uma vez

## Problem Statement
O usuário só consegue interagir uma única vez com um personagem do escritório. Se for um perfil (Tech Lead), o primeiro clique abre o terminal (alterna), mas os cliques seguintes não fazem nada. Se for um agente passivo, o primeiro clique abre a caixa de texto dele, mas depois disso não é mais possível interagir. Nenhum erro aparece: o clique simplesmente "não pega".

O defeito apareceu junto com as mudanças não commitadas do pipeline de resize (specs 116 a 119). A causa mais provável, ainda **não reproduzida**, é que o mapeamento do ponteiro para o canvas fica desatualizado depois de uma mudança de layout (por exemplo, abrir o terminal redimensiona a área do cenário), de modo que cliques seguintes caem fora do personagem. Essa hipótese não explica sozinha o caso do agente passivo em navegador comum, então a causa precisa ser confirmada antes da correção.

## Solution
Cada clique em um personagem deve funcionar sempre, quantas vezes o usuário clicar, em qualquer ordem e depois de qualquer mudança de layout (abrir, fechar, recolher ou mover o terminal, redimensionar a janela). O clique sempre atinge o personagem que está visualmente sob o cursor.

A correção primeiro confirma a causa real com um spike, depois garante que o canvas, o zoom e o mapeamento do ponteiro fiquem consistentes no mesmo quadro em que o layout muda, sem reintroduzir o cenário esticado nem o piscar.

## User Stories
1. Como usuário, quero clicar no Tech Lead e ver o terminal abrir, para começar a conversar com a sessão.
2. Como usuário, quero clicar de novo no Tech Lead e ver o terminal alternar (fechar/recolher), para controlar o espaço da tela.
3. Como usuário, quero clicar no Tech Lead quantas vezes quiser e ter o mesmo resultado esperado em todas, para confiar na interface.
4. Como usuário, quero clicar em um agente passivo e ver a caixa de texto dele abrir, para ler o que ele está fazendo.
5. Como usuário, quero clicar em um agente passivo várias vezes (abrir, avançar, fechar, abrir de novo), para interagir sempre que precisar.
6. Como usuário, quero que o clique funcione depois de abrir o terminal, para não precisar recarregar a tela.
7. Como usuário, quero que o clique funcione depois de fechar o terminal, para voltar ao cenário cheio sem perder interação.
8. Como usuário, quero que o clique funcione depois de recolher ou expandir o terminal, para alternar a visão livremente.
9. Como usuário, quero que o clique funcione depois de mudar a doca do terminal (embaixo, esquerda, direita), para escolher meu layout.
10. Como usuário, quero que o clique funcione depois de arrastar a borda do terminal, para ajustar o tamanho sem quebrar a interação.
11. Como usuário, quero que o clique funcione depois de redimensionar a janela, para usar o app em qualquer tamanho.
12. Como usuário, quero que o clique funcione em telas ultra wide, para o chão estendido não deslocar a área clicável.
13. Como usuário, quero que o clique funcione com zoom manual (Ctrl+scroll e botões), para afastar ou aproximar a câmera sem perder a interação.
14. Como usuário, quero que o clique funcione em telas HiDPI (dpr 1.5 e 2), para a interação não depender do monitor.
15. Como usuário, quero que o clique acerte o personagem que vejo sob o cursor, para não abrir o personagem errado.
16. Como usuário, quero que um clique em área vazia continue recolhendo o terminal (desktop) ou fechando o diálogo, para manter o comportamento atual.
17. Como usuário, quero que o clique funcione também no navegador comum, sem o desktop, para o caso do agente passivo sem terminal.
18. Como usuário, quero que o foco do teclado volte ao jogador ao clicar no canvas, para o teclado e o mouse seguirem coerentes.
19. Como mantenedor, quero um teste que falhe se a ordem do pipeline de resize deixar o mapeamento do ponteiro desatualizado, para o defeito não voltar.
20. Como mantenedor, quero um teste e2e que clique repetidamente nos personagens, para pegar regressões de ponta a ponta.
21. Como mantenedor, quero a causa confirmada e registrada em um learning, para evitar o mesmo erro em futuras mudanças de resize.
22. Como mantenedor, quero que a correção preserve o cenário sem esticar e sem piscar, para não desfazer a spec 116.

## Implementation Decisions
- **Confirmar antes de corrigir**: um spike compara o mapeamento interno do ponteiro do motor com o tamanho real do canvas na tela, depois de abrir o terminal e depois de redimensionar. A correção só segue se a divergência for confirmada; se a causa for outra (por exemplo, o caso do agente passivo), o teste e a correção miram a causa real.
- **Hipótese principal**: no pipeline de resize, o tamanho visual do canvas (estilo CSS) é escrito depois que o motor mede os limites do canvas, e nada mede de novo. Os limites e a escala de exibição ficam um passo atrás do canvas real, e o ponteiro é mapeado para o ponto errado do mundo.
- **Correção prevista**: depois de escrever o tamanho visual do canvas, o motor remede os limites (sem limpar o canvas), tanto no ramo em que o tamanho do jogo muda quanto no ramo em que só o contêiner se moveu. A emissão única do evento de resize para as cenas e o passo síncrono do jogo ficam como estão.
- **Módulo de ordem do resize**: a sequência (zoom, tamanho do jogo, estilo do canvas, remedição) vira uma função com dependências injetadas, sem Phaser nem DOM, seguindo a regra de manter lógica pura separada. O arquivo de entrada só liga as dependências reais.
- **Sem mudar a decisão de clique**: a decisão de quem recebe o clique, a abertura do terminal no desktop e o diálogo do agente passivo não mudam; o defeito está no mapeamento de coordenadas, não nessas regras.
- **Sem novos eventos nem contratos compartilhados**: nenhuma mudança em `shared`, no daemon ou no desktop.
- **Compatibilidade**: o mesmo bundle roda no navegador comum e no desktop; a correção não depende da ponte do desktop.

## Testing Decisions
- **Um bom teste** verifica comportamento externo observável (a ordem das operações do pipeline e o resultado do clique), não detalhes internos do motor.
- **Seam alto escolhido (confirmado com o usuário)**: lógica pura do pipeline de resize em vitest (dependências injetadas, sem relógio real) mais um teste e2e Playwright de cliques repetidos.
- **Unitário (vitest, Red primeiro)**: a remedição acontece depois da escrita do estilo do canvas nos dois ramos (viewport mudou e viewport igual); a ordem completa é zoom, tamanho, estilo, remedição; um resize sem mudança de viewport não limpa o canvas.
- **E2E (Playwright)**: clicar no Tech Lead, abrir e fechar o terminal e clicar de novo, várias vezes; clicar em um agente passivo várias vezes; repetir depois de redimensionar a janela e de mudar a doca.
- **Arte prévia**: os testes de escala existentes e a spec 116 (pipeline de resize), além dos e2e do cenário, são o modelo a seguir.
- A parte que depende de Phaser e DOM reais (mapeamento real do ponteiro) é coberta pelo e2e e pela verificação manual.

## Out of Scope
- Mudar as regras de decisão de clique, o conteúdo do diálogo ou o comportamento do terminal.
- Redesenho do chão estendido, do HUD ou do zoom (specs 117 e 118).
- Mudanças no daemon, nos contratos compartilhados ou na ponte do desktop.
- Interação por toque ou por teclado nos personagens.

## Further Notes
- A causa é hipótese vinda de leitura de código do Phaser 3.90 e das mudanças não commitadas do `applyResize`; precisa de reprodução.
- Atualizar o learning de flash de resize do canvas com a armadilha do mapeamento do ponteiro.
- Tracker do projeto: arquivos em `.claude/prds/` e `.claude/specs/`, com rótulo `ready-for-agent`.
