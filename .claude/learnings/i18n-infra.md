# Infraestrutura de i18n (spec 099)

- Código em `packages/web/src/i18n/`: `locale.ts` (tipo `Locale`, `LOCALES`, `parseLocale`, `readStoredLocale`/`writeStoredLocale`, chave `agents-office.locale`), `i18n.ts` (`initLocale`, `getLocale`, `setLocale`, `t`, `formatDateTime`) e `messages/{en,pt-BR,es}.ts`.
- `en.ts` é a fonte de verdade das chaves (`Messages`, `MessageKey`). `pt-BR.ts` e `es.ts` são tipados como `Messages`: chave faltando ou sobrando quebra o typecheck.
- Chaves planas em notação por ponto, agrupadas por área (`common.*`, `language.*`, `hud.*`...). Interpolação `{nome}`; `t` cai para inglês e depois para a própria chave.
- O idioma padrão é `en`. `main.ts` chama `initLocale()` antes de montar painéis e define `document.documentElement.lang`. Trocar o idioma em runtime só em memória (`setLocale`) é para testes; a UI aplica a escolha após recarregar.
- Testes de texto que dependem do idioma devem usar `setLocale` (e restaurar em `afterEach`), pois o padrão agora é inglês.
- Datas usam `formatDateTime` (nunca `'pt-BR'` fixo).

## Botão de idioma (spec 100)

- `ui/localeButton.ts` monta o botão como último item da corner bar (`main.ts`, depois dos blocos das pontes desktop). Escolher grava com `writeStoredLocale` e chama `location.reload()`; `setLocale` não é usado na troca.
- O menu captura o teclado do Phaser via `onKeyboardCapture` (mesmo padrão de castPanel); ao fechar, respeita `document.body.dataset.keyboard` para não roubar o teclado de um terminal focado.
- Chaves novas: `locale.title` e `locale.menuLabel` (as `language.*` da spec 099 seguem sem uso).
- O E2E "12. Hooks button..." já falhava antes (botão `static` dentro da barra `absolute`); não relacionado a esta spec.

## Hooks, Sessões, diálogos e avisos (spec 102)

- Prefixos: `hooks.*` (painel e banner), `picker.*` (seletor de projetos, modos de permissão, tempo relativo `picker.when.*`), `dialog.*` (balões, profissões `dialog.profession.*`, status `dialog.status.*`, ações), `lost.*` (sessões perdidas), `update.*` (banner de atualização), `external.*` (falha ao abrir no VS Code).
- Constantes de módulo com texto viraram funções para o `t()` resolver na chamada: `professionLabel()`/`statusLabel()` (antes `PROFESSION_LABEL`/`STATUS_LABEL`, também usados por `hallOfFame.ts` e `spawnApprovalCard.ts`), `launchLabel()`, `permissionModes()` (antes `PERMISSION_MODES`, usado por `castPanel.ts`), `cardsTag()`, `trustFolderNote()`. A chave da nota do modo é dinâmica: `picker.mode.<modo>.note`.
- Nomes de modos de permissão (`acceptEdits`, `plan`...), nomes de perfil, projeto e conteúdo de sessão não são traduzidos.
- Os balões continuam sem acentos nas strings pt-BR/es de `dialog.*` (fonte bitmap); o truncamento usa `DIALOG_COLS`, então o texto mais longo de cada idioma é cortado, não quebra o layout.
- Testes que ainda afirmam texto em pt-BR fixam `setLocale('pt-BR')` em `beforeEach`; cada módulo tem um caso extra em `en`/`es`. O E2E de `desktop.spec.ts` agora espera `Open terminal`/`Open in VS Code` (idioma padrão `en`).

## Terminal, navegador, quadro e demais (spec 104)

- Chaves novas: `terminal.*`, `browser.*` (inclui `browser.context.*`, `browser.approval.*`,
  `browser.permission.*`), `approval.*` (Permitir/Negar/fila, compartilhado com `spawn.*`), `board.*`,
  `identity.*`, `hall.*`, `player.name`, `character.someone`.
- Cartões de aprovação do navegador: o título agora é montado na web (`approvalTitle` em
  `browserApprovalLogic.ts`) a partir de `kind` + `origin`/`detail`/`filename`/`agentName`; o `title`
  em pt-BR enviado pelo processo principal é só fallback. `filename` foi adicionado (opcional) ao
  `BrowserApprovalRequest`. Aprovações continuam falhando fechadas.
- `STATUS_SHORT` virou `statusShort()`; `TYPE_ALIASES`/`TOOL_VERB` viraram funções; `BOARD_LABEL` virou
  `boardLabel()`; `PICK_CONTEXT_HEADER/FOOTER` viraram `pickContextHeader()/Footer()`.
- O contexto do elemento escolhido segue o idioma da interface (é texto editável colado no terminal).
- Fora de escopo de propósito: erros do conversor Mermaid (voltam ao agente, em inglês) e os dados da
  demo (`net/demo.ts`).
