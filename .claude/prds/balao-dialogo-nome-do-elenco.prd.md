---
title: Nome do perfil do elenco no balão de diálogo
status: ready-for-agent
labels: [ready-for-agent]
created: 2026-10-12
related: [perfis-sessoes-gerenciadas.prd.md]
---

# PRD: Nome do perfil do elenco no balão de diálogo

## Problem Statement
Quando o usuário cria um perfil do elenco com um nome específico (por exemplo "Designer"), o personagem aparece corretamente com esse nome na etiqueta acima do avatar. Porém, ao clicar no avatar para conversar, o balão de diálogo mostra sempre "Tech Lead" no cabeçalho. O nome escolhido pelo usuário some justamente no ponto de interação, o que confunde e faz o perfil parecer uma sessão anônima.

Causa lida do código: o cabeçalho da primeira página do diálogo tem o texto "Tech Lead" fixo, e a abertura do diálogo monta o conteúdo apenas a partir do modelo do escritório, sem receber os dados da sessão gerenciada (que guardam o nome do perfil). A etiqueta do avatar acerta porque usa esses dados por outro caminho.

## Solution
O balão de diálogo de um personagem do elenco passa a mostrar o nome do perfil no cabeçalho. Sessões que não vieram de um perfil (por exemplo, iniciadas fora do app) continuam mostrando "Tech Lead". Nada mais no diálogo muda.

## User Stories
1. Como usuário, quero ver o nome do meu perfil (ex.: "Designer") no cabeçalho do balão ao conversar com o avatar, para saber com quem estou falando.
2. Como usuário, quero que o nome no balão seja o mesmo da etiqueta acima do avatar, para a interface ser consistente.
3. Como usuário, quero que sessões que não vieram de um perfil continuem aparecendo como "Tech Lead", para não perder a distinção entre elenco e líderes externos.
4. Como usuário, quero que o cabeçalho continue mostrando a profissão do personagem junto ao nome, para manter a informação que já existia.
5. Como usuário, quero que renomear um perfil reflita no balão na próxima vez que eu abrir o diálogo, para não ver nomes velhos.
6. Como usuário com vários perfis de mesma profissão, quero distinguir cada um pelo nome no balão, para não confundi-los.
7. Como usuário, quero que as páginas e ações seguintes do diálogo (projeto, último pedido, equipe, terminal, VS Code) continuem iguais, para não haver regressão.
8. Como usuário com nome de perfil longo, quero que o cabeçalho seja truncado ao tamanho do balão, para o texto não estourar a caixa.
9. Como desenvolvedor, quero que a regra do título seja lógica pura testável, para validar sem navegador.

## Implementation Decisions
- O contexto do diálogo ganha dois campos opcionais: o nome do perfil gerenciado e a profissão base do perfil.
- O cabeçalho da primeira página usa o nome do perfil quando presente e "Tech Lead" quando ausente; o sufixo de profissão usa a profissão do perfil quando presente e a da sessão caso contrário.
- Quem abre o diálogo consulta a visão do personagem gerenciado já existente (a mesma usada pela etiqueta do avatar) e preenche o contexto; nenhuma fonte de dados nova é criada.
- O componente de caixa de diálogo apenas exibe as strings recebidas e não muda.
- O cabeçalho continua truncado à largura do diálogo.
- Strings de UI permanecem em pt-BR; código e comentários em inglês.

## Testing Decisions
- Um bom teste verifica o comportamento externo (o texto das páginas geradas), não detalhes de implementação.
- O seam é a função pura que gera as páginas de diálogo, coberta pelo teste de conteúdo do diálogo, sem Phaser nem DOM.
- Casos: sessão sem perfil mantém "Tech Lead"; sessão com perfil mostra o nome; nome longo é truncado; as demais páginas ficam inalteradas.
- Prior art: os testes existentes de conteúdo do diálogo, que já afirmam o cabeçalho "Tech Lead".
- A integração com a cena é verificada manualmente no app desktop.

## Out of Scope
- Alterar a etiqueta do avatar (já correta).
- Mudar o layout, as páginas ou as ações do diálogo.
- Diálogo de subagentes.
- Mudar rótulos de profissão no editor do elenco ou no painel de ajuda.

## Further Notes
O fallback "Tech Lead" na etiqueta do avatar também existe para sessões não gerenciadas; manter o mesmo critério no balão preserva a coerência.
