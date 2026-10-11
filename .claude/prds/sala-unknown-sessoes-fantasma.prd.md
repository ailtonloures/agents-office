# PRD — Fim da sala "Unknown" e das sessões fantasma

## Problem Statement

Às vezes o escritório abre uma sala nova chamada "Unknown", que não corresponde a nenhum projeto real. Além disso, o HUD mostra 4 sessões ativas quando o usuário só enxerga 2 (do projeto agent-office). O usuário espera salas apenas para projetos conhecidos, ou seja, sessões que realmente começaram com um diretório de trabalho, e uma contagem de sessões que reflita só o que existe de fato.

## Solution

Eventos que pertencem a uma sessão desconhecida deixam de inventar uma sessão e um projeto "unknown". Eles são descartados (ou, com exatamente uma sessão ativa, anexados a ela como hoje). Uma sessão encerrada ou expirada que for retomada volta a emitir seu início, então recebe uma sala real em vez de cair num placeholder. Como rede de segurança, a contagem do HUD e do `/health` ignora qualquer placeholder residual.

## User Stories

1. Como usuário, quero que nunca apareça uma sala "Unknown", para que o escritório mostre só meus projetos.
2. Como usuário, quero que o toast "NOVA SALA" só apareça para projetos reais, para não me confundir com avisos falsos.
3. Como usuário, quero que o HUD mostre o número real de sessões ativas, para confiar no contador.
4. Como usuário, quero que o número de agentes do HUD e do `/health` ignore fantasmas, para que ambos concordem.
5. Como usuário, quero que um evento tardio (Stop, fim do JSONL) de uma sessão já encerrada seja ignorado, para que não renasça como sala fantasma.
6. Como usuário, quero que uma sessão retomada depois de encerrada ou expirada volte a ter sua sala, para continuar vendo a atividade.
7. Como usuário, quero que eventos de sub-agentes de uma sessão desconhecida não criem salas, para que sub-agentes órfãos não poluam o escritório.
8. Como usuário, quero que uma sessão iniciada por hook sem diretório de trabalho não crie uma sala com o id como nome, para não ver salas com nomes ilegíveis.
9. Como usuário, quero que o comportamento atual com uma única sessão ativa (anexar atores órfãos a ela) continue funcionando.
10. Como usuário, quero que sessões de projetos diferentes (worktrees incluídos) continuem a ter suas próprias salas.
11. Como usuário, quero que sessões realmente ociosas ou expiradas continuem sendo removidas pelo liveness, sem regressão.
12. Como desenvolvedor, quero testes que cubram eventos órfãos, retomada de sessão e contagem, para evitar a volta do bug.
13. Como desenvolvedor, quero um registro do aprendizado sobre placeholders, para não reintroduzir esse padrão.

## Implementation Decisions

- "Projeto conhecido" significa um projeto criado por um início de sessão com diretório de trabalho. Não há lista de projetos permitidos; o modelo só cria projetos a partir desses inícios.
- O redutor para de criar sessões e projetos placeholder. Eventos de ator, de início de agente e de vínculo de sessão que referenciam uma sessão ausente deixam o modelo inalterado.
- Mantida a exceção: um ator órfão com exatamente uma sessão existente é anexado a ela.
- O mecanismo de adoção de órfãos do placeholder e as constantes "unknown" são removidos quando ficarem sem uso.
- O normalizador esquece a marca "sessão já iniciada" quando emite o fim da sessão, para que uma retomada emita novo início. Verificar se a expiração por tempo do daemon também precisa liberar essa marca; se sim, expor o fim ao normalizador, ou reemitir o início ao ver um evento de sessão ausente do modelo.
- Hooks sem diretório de trabalho não iniciam sessão, e o id da sessão nunca vira nome de projeto.
- Defesa em profundidade: a contagem de sessões e agentes vivos (HUD e `/health`) ignora sessões cujo projeto é o placeholder ou cujo diretório de trabalho está vazio.
- Nenhuma mudança de contrato público de eventos ou de API.
- Premissa não verificada em execução: que o 4 vem de 2 sessões reais + 2 fantasmas. A análise foi feita lendo o código; confirmar listando as sessões do `/health` ou do snapshot de `/stream` antes de fechar.

## Testing Decisions

- Um bom teste verifica comportamento externo (modelo resultante, eventos emitidos, números da contagem), não detalhes internos.
- Redutor: evento de ator, início de agente e vínculo para sessão desconhecida não criam sessão nem projeto; com uma única sessão, o ator é anexado a ela.
- Normalizador: sessão encerrada e retomada reemite o início; hook sem diretório de trabalho não inicia sessão nem nomeia projeto com o id.
- Contagem: o cálculo do HUD e o `/health` ignoram placeholders.
- Liveness: expiração por tempo segue removendo sessões, e a retomada depois da expiração volta a criar a sala.
- Arte prévia: testes existentes do redutor e do normalizador em shared e daemon, `liveness.test.ts` e `hudLogic.test.ts`; E2E em `office.spec.ts` com o alimentador de eventos.

## Out of Scope

- Lista configurável de projetos permitidos ou ignorados.
- Mudar a regra de 15 minutos de expiração de sessão ou o tempo de ociosidade.
- Renomear projetos de worktrees para o repositório de origem.
- Mudanças visuais nas salas, no HUD ou no toast.

## Further Notes

- Pode haver sessões reais de outros projetos ou worktrees que o usuário não esteja olhando; elas têm sala própria com o nome do diretório e continuam contando.
- O diretório de trabalho de uma sessão iniciada em subpasta gera uma sala com o nome da subpasta, não "agent-office". Isso é comportamento atual e não faz parte deste PRD.
