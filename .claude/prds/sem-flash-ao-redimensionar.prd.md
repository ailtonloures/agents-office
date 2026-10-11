# PRD — Sem flash ao redimensionar, minimizar ou abrir o terminal

## Problem Statement
Sempre que o usuário aumenta ou diminui a janela, arrasta a borda do painel do terminal, clica no vazio para minimizar o terminal ou clica no Tech Lead para abri-lo, a área do escritório "pisca": aparece um frame vazio antes de o escritório ser redesenhado. A interface parece instável e pouco fluida.

## Solution
Mudanças de layout (janela, dock do terminal, minimizar, abrir) mantêm o escritório visível o tempo todo. O canvas só é redimensionado quando o tamanho ou o zoom realmente mudam, no máximo uma vez por frame, e é redesenhado antes de o navegador pintar. Eventos que não mudam o layout (ex.: troca de estado de uma aba) não disparam redimensionamento.

## User Stories
1. Como usuário, quero redimensionar a janela sem ver o escritório piscar, para que a interface pareça estável.
2. Como usuário, quero arrastar a borda do painel do terminal sem flicker contínuo, para ajustar o tamanho com fluidez.
3. Como usuário, quero minimizar o terminal clicando no vazio sem flash, para voltar ao escritório sem distração.
4. Como usuário, quero abrir o terminal clicando no Tech Lead sem flash, para começar a digitar imediatamente.
5. Como usuário, quero que o terminal receba o teclado ao abrir pelo Tech Lead, sem depender de um segundo ciclo de layout.
6. Como usuário, quero que mudar o dock (esquerda, direita, baixo) não pisque o escritório.
7. Como usuário, quero que a atividade dos agentes mudando o título das abas não cause nenhuma piscada, para trabalhar sem interrupções visuais.
8. Como usuário, quero que o HUD, os diálogos e a câmera continuem posicionados corretamente depois de qualquer redimensionamento.
9. Como usuário, quero que o zoom do escritório e o enquadramento do jogador continuem corretos após redimensionar.
10. Como usuário, quero que a aplicação não consuma mais memória gráfica a cada redimensionamento, para ficar aberta por horas.
11. Como desenvolvedor, quero que o redimensionamento seja idempotente (mesmos valores = nada acontece), para evitar trabalho e limpezas de canvas redundantes.
12. Como desenvolvedor, quero uma única fonte coalescida de redimensionamento por frame, para raciocinar sobre quando o canvas muda.
13. Como desenvolvedor, quero poder contar quantos redimensionamentos reais ocorreram, para testar a ausência de flash automaticamente.

## Implementation Decisions
- O redimensionamento do jogo guarda o último par (zoom, largura, altura) e ignora chamadas com os mesmos valores.
- Quando o tamanho muda, o jogo é redesenhado de forma síncrona logo após o redimensionamento, antes de o navegador pintar, para que o canvas limpo nunca chegue à tela.
- Os gatilhos (evento de janela, observador de tamanho do contêiner e callback de layout do painel) passam por um agendador único que coalesce em no máximo uma execução por frame.
- O painel do terminal emite layout somente quando a chave de layout (ocupação, eixo, dock, minimizado) muda desde o último layout emitido; atualizações de atividade/título de aba não emitem layout.
- Abrir um terminal pelo Tech Lead não repete a ativação/renderização da aba um frame depois; apenas garante o foco do teclado no terminal.
- A textura de vinheta anterior é removida quando uma nova é criada para o novo tamanho.
- Expor no estado de debug um contador de redimensionamentos reais do canvas, para testes E2E.

## Testing Decisions
- Bons testes validam comportamento externo: quantas vezes o canvas foi redimensionado e se houve frame vazio, não detalhes internos de timers.
- Seams (do mais alto ao mais baixo): E2E com Playwright (contador de resize no estado de debug por ação: redimensionar janela, minimizar, abrir Tech Lead, trocar dock); unitário da lógica pura de guarda do resize e da chave de layout do painel; unitário da limpeza de texturas de vinheta.
- Prior art: testes unitários de `scale.ts` e `terminalTabs`, e `e2e/tests/office.spec.ts`.

## Out of Scope
- Mudar a política de zoom inteiro do escritório.
- Reescrever o painel do terminal ou trocar xterm.
- Animações/transições de abrir e fechar o painel.

## Further Notes
Causa raiz identificada na leitura do código (não observada em execução): redimensionar o canvas o limpa, e isso acontece fora do passo de render do Phaser. Validar manualmente no app desktop após a implementação, já que o flash é uma percepção visual.
