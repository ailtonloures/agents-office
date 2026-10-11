# PRD — Cenário com volume: porta atravessável, paredes com profundidade e móveis fortes

## Problem Statement
O escritório é visto de cima em 3/4. Os personagens estão bons, mas o cenário ainda parece plano e pobre perto deles.

A primeira rodada fez três coisas, ainda sem commit:
- as paredes de cima ganharam 3 tiles de altura;
- as portas de vidro passaram a abrir e fechar sozinhas;
- os móveis ganharam sombra.

Mesmo assim, três problemas continuam:

1. **A porta não é atravessada.** O avatar passa por cima da porta e não por dentro do batente. A porta fica sempre atrás dele, então não parece que ele está cruzando uma abertura na parede.
2. **A parede não mostra profundidade.** A altura melhorou, mas o topo é uma faixa escura e fina da mesma cor das laterais. Ela lê como uma borda desenhada, e não como uma laje com espessura.
3. **Os objetos estão fracos.**
   - Os móveis têm pouco contraste e materiais lavados.
   - A maioria é desenhada de frente: tampos sem espessura, pouco plano de topo, pés e bases sem volume.
   - Ao lado dos personagens, eles parecem rascunho.

## Solution
O escritório continua em 3/4 e na grade atual. Os personagens não mudam. Todo o cenário passa a ter volume legível.

- **Porta atravessável.** A porta é desenhada em duas camadas:
  - **Fundo:** o vão escuro e a espessura da parede vista por dentro da abertura.
  - **Frente:** a parede acima da porta, a verga, as ombreiras, as folhas de vidro e a soleira. A frente é ordenada com os personagens pela linha do piso da parede.
  - Enquanto o avatar cruza a parede, a verga e as ombreiras ficam na frente dele e o vidro aparece por cima, em semitransparência. Assim que ele pisa na sala, passa para a frente da parede.
  - A porta abre com antecedência, para que ninguém atravesse o vidro fechado.
- **Parede com profundidade.**
  - A laje do topo fica mais grossa e mais clara. Ela tem plano iluminado, aresta frontal de luz, face frontal escura e projeta sombra na parede.
  - As laterais usam o mesmo material, com aresta de luz e lado de sombra.
  - A parede de baixo mostra a fachada.
  - O vão da porta mostra a espessura da parede.
  - A face tem gradiente vertical mais marcado e oclusão junto ao piso. A sombra no piso fica mais longa.
- **Móveis com volume.** Todos os móveis são redesenhados com uma linguagem comum:
  - **Planos:** topo claro, frente com gradiente, aresta de luz à esquerda e sombra à direita.
  - **Estrutura:** tampos com espessura, pés com sombra.
  - **Acabamento:** materiais com mais contraste, objetos com detalhe e sombra.
  - As peças continuam nos mesmos lugares e tamanhos de piso.

## User Stories
1. Como usuário, quero ver meu avatar passar por dentro do batente da porta ao entrar numa sala, para sentir que estou atravessando uma parede de verdade.
2. Como usuário, quero que a verga e as ombreiras fiquem na frente do avatar enquanto ele cruza a parede, para perceber a espessura da porta.
3. Como usuário, quero ver o avatar através do vidro enquanto a porta desliza, para entender que o vidro está na frente dele.
4. Como usuário, quero que o avatar apareça na frente da parede assim que pisar dentro da sala, para que a profundidade continue coerente.
5. Como usuário, quero que a porta já esteja aberta quando o avatar chega ao vão, para nunca ver alguém atravessando o vidro fechado.
6. Como usuário, quero que a porta feche depois que todos se afastam, para que a sala pareça fechada quando ninguém passa.
7. Como usuário, quero que os agentes (NPCs) também abram a porta ao entrar e sair, para que o escritório pareça vivo.
8. Como usuário, quero que a porta volte a abrir se alguém se aproximar enquanto ela fecha, para que ela não feche na cara de ninguém.
9. Como usuário, quero que passar pelo corredor sem entrar não abra portas à toa, para não haver movimento sem motivo.
10. Como usuário, quero ver a espessura da parede no topo como uma laje clara, iluminada e com aresta, para entender que a parede é um volume.
11. Como usuário, quero que a laje projete sombra na parede logo abaixo, para que o topo pareça saliente.
12. Como usuário, quero que as paredes laterais tenham o mesmo material e espessura do topo, com lado de luz e lado de sombra, para que a sala pareça uma caixa construída.
13. Como usuário, quero que os cantos tenham a laje contínua entre topo e laterais, para que as paredes pareçam uma peça só.
14. Como usuário, quero ver a fachada da parede de baixo das salas, para perceber a espessura também na frente.
15. Como usuário, quero ver a espessura da parede dentro do vão da porta, para ter o indicador de profundidade mais forte.
16. Como usuário, quero que a face da parede escureça em direção ao piso e tenha oclusão no encontro com o chão, para que a parede assente no piso.
17. Como usuário, quero que a parede projete no piso uma sombra mais longa, para reforçar a altura.
18. Como usuário, quero que mesas e bancadas tenham tampo com espessura e pés com sombra, para que pareçam objetos sólidos.
19. Como usuário, quero que as cadeiras tenham assento com espessura, encosto com volume e base com rodízios, para que combinem com o nível de detalhe dos personagens.
20. Como usuário, quero que estantes e o quadro kanban tenham laterais com espessura e prateleiras com aresta de luz, para que pareçam móveis e não adesivos.
21. Como usuário, quero que sofás e poltronas tenham braços e almofadas com volume, para que a área de descanso fique convidativa.
22. Como usuário, quero que rack, geladeira, bebedouro e impressora mostrem topo, frente e lado sombreado, com detalhes (LEDs, grelhas, garrafão translúcido), para que os equipamentos sejam reconhecíveis.
23. Como usuário, quero que cozinha e recepção tenham bancada com tampo saliente e sombra embaixo, para que tenham presença no ambiente.
24. Como usuário, quero vasos com boca e terra visíveis e folhas com variação de tom, para que as plantas tenham volume.
25. Como usuário, quero que quadros, TV e whiteboard tenham moldura com espessura e sombra na parede, para que pareçam pendurados.
26. Como usuário, quero que os móveis tenham materiais com mais contraste, para que se destaquem do piso.
27. Como usuário, quero que os monitores animados, o brilho dos abajures e o vapor do café continuem no lugar certo depois do redesenho, para não perder a vida do escritório.
28. Como usuário, quero que os móveis continuem nos mesmos lugares e bloqueando os mesmos tiles, para que caminhos, mesas e assentos funcionem como antes.
29. Como usuário, quero que o personagem sentado continue com a cadeira na frente das costas e o monitor visível, para não perder a leitura de quem está trabalhando.
30. Como usuário de uma skin antiga, quero que o escritório continue funcionando, mesmo sem os quadros novos, para não quebrar personalizações.
31. Como usuário, quero que o zoom e a visão geral (M) continuem enquadrando tudo, para navegar como antes.
32. Como desenvolvedor, quero helpers de volume reutilizáveis (tampo, caixa, pés) no gerador da skin, para manter uma linguagem visual única e redesenhar móveis com menos código.
33. Como desenvolvedor, quero poder aumentar o contraste das rampas de material sem alterar as rampas dos personagens, para não mexer em arte que está aprovada.
34. Como desenvolvedor, quero a lógica de abrir e fechar a porta pura e testável, incluindo uma simulação de travessia, para garantir por teste que ninguém atravessa o vidro fechado.
35. Como desenvolvedor, quero o estado das portas exposto no estado de debug, para validar a abertura e o fechamento em E2E.

## Implementation Decisions
- **Projeção:** continua 3/4 sobre a grade de 16 px. A isometria verdadeira foi descartada, porque mudaria personagens, câmera e cliques.
- **Base da rodada 1, que se mantém:**
  - paredes de cima com 3 linhas (topo, meio e base);
  - porta aberta em todas as linhas da parede, com `tile` na linha de baixo e `outside` no corredor acima da parede;
  - abertura e fechamento por proximidade, com atraso para fechar;
  - lógica de passo da porta pura.
- **Porta em duas camadas:**
  - **Fundo:** um quadro único com o vão e a espessura da parede (o "reveal"). Fica na profundidade dos objetos de parede, sempre atrás dos personagens.
  - **Frente:** os quadros de animação, de fechada a aberta, com parede acima da verga, verga, ombreiras e folhas de vidro. O vidro é semitransparente e o caixilho, opaco; o vão fica transparente.
  - **Profundidade da frente:** igual à fórmula dos personagens (`4 + y/10000`) calculada na linha do piso da parede, mais meio pixel. Assim:
    - quem está nas linhas da parede fica atrás da frente;
    - quem está na sala fica na frente;
    - quem está no corredor não se sobrepõe à porta.
  - **Abertura:** o vão tem cerca de 36 px de altura e o personagem, 32 px.
  - **Skins:** uma skin sem o quadro de fundo continua com a porta em camada única. Uma skin sem quadros de porta continua usando o tile de porta.
- **Timing da porta:**
  - frames mais curtos (~40 ms; a porta abre em cerca de 200 ms);
  - mantém o raio de abertura de 2 linhas além do vão e 1 coluna para cada lado;
  - o passo do jogador (200 ms por tile) define o requisito: a porta está totalmente aberta antes de o avatar entrar na primeira linha do vão.
- **Parede:**
  - **Laje do topo:** 8 px num cinza quente claro, no lugar da faixa escura. Tem plano iluminado com textura leve, aresta frontal clara de 1 px, face frontal escura de 2 px, gradiente de sombra de 4 px na face e uma linha escura de 1 px na borda de trás.
  - **Laterais:** o mesmo material, com 8 px (16 px entre salas vizinhas), aresta de luz do lado esquerdo e face de sombra do lado direito. Nos cantos, a laje é contínua.
  - **Parede de baixo:** laje clara mais uma fachada de 8 px com junta.
  - **Face:** gradiente vertical mais marcado e oclusão de 3 px junto ao piso. Mantém lambri e rodameio.
  - **Sombra no piso:** passa a ter 6 linhas.
  - Todas as cores vêm de uma única função de cor da parede, que a arte da porta reaproveita para casar pixel a pixel.
- **Móveis:**
  - **Helpers de volume no gerador:**
    - tampo, com plano de topo, aresta e espessura;
    - caixa, com topo, frente em gradiente, aresta de luz e borda de sombra;
    - pés, com sombra própria.
  - **Contraste:** a rampa de material ganha um parâmetro opcional de contraste. O padrão continua igual, para não alterar os personagens.
  - **Redesenho:** os 27 móveis são redesenhados com esses helpers.
  - **O que se mantém:**
    - a largura de piso de cada móvel;
    - os blocos de colisão;
    - o viés de profundidade (cadeiras);
    - a âncora pela base do footprint.
  - **Arte pode crescer em altura.**
  - **Os retângulos dos monitores e os pontos de luz** (monitor, abajur, vapor) continuam válidos. Se a arte mover algum, os offsets de iluminação são ajustados.
- **Sombra projetada:** a sombra suave para baixo e para a direita, assada no atlas na rodada 1, continua. Ela fica recortada no slot de cada móvel.
- **Atlas e manifesto da skin:** só ganham quadros (porta de fundo, novas artes). Nenhum campo obrigatório novo; o manifesto é regenerado pelo gerador.

## Testing Decisions
- **O que é um bom teste aqui:**
  - verifica comportamento observável: se a porta abre, fecha e está aberta quando alguém passa; se o layout segue andável e com colisão correta;
  - não verifica pixels nem detalhes internos de desenho;
  - a arte é validada visualmente com screenshots.
- **Seams, do mais alto ao mais baixo:**
  1. **E2E (Playwright):** o estado de debug `doors` vai de fechada para aberta quando o jogador se aproxima e entra na sala, e volta para fechada quando ele se afasta. Os fluxos existentes (entrar na sala, Tab até a porta, Hall da Fama) continuam passando.
  2. **Unitário da lógica pura da porta** (proximidade e passo da animação):
     - abre, fecha com atraso e reverte no meio;
     - uma **simulação de travessia**: o jogador anda do corredor até dentro da sala a 200 ms por tile, e a porta está no último quadro em todo passo dentro do vão;
     - a contagem de quadros exige o quadro de fundo para ativar as duas camadas.
  3. **Unitário do layout:** porta aberta em todas as linhas, paredes de 3 linhas bloqueando, mesas e pontos de interesse alcançáveis, ids de mesa estáveis. Já existe e continua igual.
  4. **Unitário da skin:** a skin padrão valida, os tiles e quadros novos são opcionais e as skins antigas carregam.
- **Prior art:** os testes da porta e do layout da rodada 1, o teste de skin e `e2e/tests/office.spec.ts` (que já usa `approachDoor` e o estado de debug).

## Out of Scope
- Mudar personagens, poses ou animações.
- Isometria verdadeira, câmera ou projeção.
- Novos tipos de móveis ou mudanças na disposição das salas.
- Som de porta.
- Shaders ou iluminação dinâmica nova. O render do Canvas de fallback continua igual.

## Further Notes
- Para iterar a arte rapidamente, use um script descartável que compõe o atlas sobre o piso ao lado de um personagem, ampliado 3×. O método está registrado na learning de visuais do escritório.
- Após gerar a skin, formate o manifesto com o biome.
- O trabalho da rodada 1 ainda não tem commit e é a base desta entrega.
