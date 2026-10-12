---
title: Auto-update do app desktop e releases no GitHub
status: ready-for-agent
labels: [ready-for-agent, needs-spec]
created: 2026-10-11
related: [agents-office.prd.md]
---

# PRD: Auto-update do app desktop e releases no GitHub

## Problem Statement
O app desktop é instalado manualmente e nunca se atualiza: o usuário não sabe quando há versão nova e precisa baixar e reinstalar por conta própria. Também não existe pipeline de release: não há versões, tags nem binários publicados no GitHub.

## Solution
O app instalado (AppImage Linux) verifica periodicamente se há versão nova no GitHub Releases, avisa o usuário com um banner e uma notificação nativa, baixa a atualização em segundo plano e oferece "Reiniciar e atualizar". Ao confirmar, o app encerra de forma limpa (terminais e daemon), instala e reabre já na nova versão. Cada tag `vX.Y.Z` dispara um workflow que gera o AppImage e o publica numa GitHub Release.

## User Stories
1. Como usuário, quero que o app verifique atualizações sozinho, para não precisar procurar versões novas.
2. Como usuário, quero ser avisado quando há uma versão nova, para saber que posso atualizar.
3. Como usuário, quero ver um banner com o número da nova versão, para saber o que será instalado.
4. Como usuário, quero receber uma notificação nativa quando a atualização estiver pronta, para perceber mesmo com a janela em segundo plano.
5. Como usuário, quero que o download aconteça em segundo plano com progresso visível, para continuar trabalhando.
6. Como usuário, quero um botão "Reiniciar e atualizar", para instalar quando eu decidir.
7. Como usuário, quero um botão "Depois", para adiar a atualização sem ser incomodado de novo na mesma sessão.
8. Como usuário, quero que a atualização pendente seja instalada ao fechar o app, para não perdê-la se eu adiar.
9. Como usuário, quero ser avisado antes de reiniciar se houver terminais ativos, para não perder sessões sem querer.
10. Como usuário, quero que o app reabra sozinho na nova versão, para não precisar iniciá-lo de novo.
11. Como usuário, quero que o daemon e os terminais sejam encerrados de forma limpa antes de instalar, para não deixar processos órfãos.
12. Como usuário, quero um item "Verificar atualizações" no menu da bandeja e do app, para checar manualmente.
13. Como usuário, quero um item "Reiniciar para atualizar" no menu quando houver atualização pronta, para ter outro caminho de instalação.
14. Como usuário, quero feedback quando já estou na versão mais recente, para saber que a checagem funcionou.
15. Como usuário, quero que falhas de rede ou de download não travem o app nem mostrem erros alarmantes, para o uso normal continuar.
16. Como usuário, quero tentar novamente após uma falha, para recuperar de erro temporário.
17. Como usuário do `.deb`, quero que o app não tente se auto-atualizar, para não ver erros de um fluxo sem suporte.
18. Como desenvolvedor rodando em modo dev, quero que o updater fique desligado, para não interferir no desenvolvimento.
19. Como usuário em navegador comum (sem desktop), quero que nenhum banner de atualização apareça, para não ver UI irrelevante.
20. Como mantenedor, quero publicar uma release criando uma tag `vX.Y.Z`, para ter um fluxo simples e previsível.
21. Como mantenedor, quero que o workflow valide que a tag bate com a versão do app, para evitar releases inconsistentes.
22. Como mantenedor, quero que o workflow publique o AppImage e o `latest-linux.yml` numa GitHub Release com notas geradas, para o updater e os usuários acharem os binários.
23. Como mantenedor, quero um comando `pnpm release` que faça o bump de versão e a tag, para reduzir erros manuais.
24. Como mantenedor, quero a lógica do updater isolada e testada com um `autoUpdater` falso, para evoluir sem depender da rede.
25. Como mantenedor, quero a configuração de publicação coberta por teste, para não quebrar o pipeline sem perceber.
26. Como mantenedor, quero o processo de release documentado, para qualquer pessoa conseguir publicar.

## Implementation Decisions
- Biblioteca: `electron-updater`, dependência de runtime do desktop, marcada como externa no bundle do processo principal.
- Publicação: provider GitHub no repositório `ailtonloures/agents-office`; metadados de repositório do pacote corrigidos para o mesmo repositório.
- Escopo de plataforma: somente Linux AppImage. `.deb`, macOS e Windows não se auto-atualizam nesta versão.
- Serviço de update puro, sem import do Electron, com dependências injetadas (`autoUpdater`, empacotado?, AppImage?, emissor de eventos, relógio), seguindo o padrão dos demais módulos do processo principal.
- Só ativa quando o app está empacotado e executando como AppImage; caso contrário vira no-op.
- Download automático; instalação ao sair habilitada; checagem 15 s após o boot e a cada 4 h.
- Estados expostos: ocioso, verificando, disponível (versão), baixando (percentual), pronto (versão), erro.
- Canal IPC com handlers confiáveis e validados (estado atual, checar agora, instalar) e push de status do processo principal para a janela.
- Ponte tipada no pacote compartilhado e no preload, opcional na interface do desktop; a web só monta a UI se a ponte existir.
- UI: banner DOM em PT-BR com versão, progresso, "Reiniciar e atualizar" e "Depois"; estilos compartilhados de botão; respeita a captura de teclado do jogo.
- Notificação nativa quando o estado chega a "pronto", via a central de notificações existente; itens de menu na bandeja e no menu do app.
- Reinício limpo: a instalação passa pelo coordenador de saída existente (confirmação se houver sessões, encerramento de terminais e daemon) e, ao final, chama a instalação do updater em vez de apenas sair; sem loop de `before-quit`.
- Release: workflow disparado por tag `v*`, em ubuntu, valida tag × versão do desktop, builda e publica com `--publish always` e token do próprio GitHub, permissão de escrita em conteúdo.
- Comando `release` na raiz que incrementa a versão do desktop, comita e cria a tag.

## Testing Decisions
- Bom teste: verifica comportamento observável (estados emitidos, chamadas ao updater, botões e textos do banner), sem depender de detalhes internos.
- Seam 1 (unitário, mais alto): serviço de update com `autoUpdater` falso — no-op fora do AppImage, transições disponível→baixando→pronto, erro e retry, instalar. Prior art: testes dos módulos puros do desktop (ex.: quitFlow).
- Seam 2 (unitário): lógica do banner na web (texto, visibilidade, "Depois"). Prior art: `settingsLogic`.
- Seam 3 (unitário): `packaging.test.ts` ampliado para o bloco `publish` e o workflow de release.
- Seam 4 (E2E Playwright): banner com ponte de updater simulada, estados disponível e pronto.
- Verificação manual ponta a ponta com uma tag de teste (0.1.0 → 0.1.1) usando o AppImage real.

## Out of Scope
- Auto-update de macOS e Windows, `.deb`, assinatura de código.
- Canal beta/pré-release, rollback automático, atualização diferencial customizada.
- Changelog dentro do app.

## Further Notes
macOS sem assinatura não atualiza de forma confiável (Squirrel.Mac exige app assinado); um PRD futuro pode cobrir assinatura e Windows. O AppImage precisa ser executado de verdade (variável `APPIMAGE` definida) para o updater funcionar.
