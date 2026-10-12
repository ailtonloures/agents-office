# i18n: decisões e armadilhas (spec 105)

Complementa `i18n-infra.md` (que descreve os módulos). Aqui ficam as decisões e o que dá errado.

## Decisões

- Idioma escolhido fica em `localStorage` (`agents-office.locale`), lido uma vez em `initLocale()` antes de montar qualquer painel. Não passa por IPC, preload nem `shared`.
- Trocar de idioma grava e recarrega a página (`location.reload()`); não há re-render ao vivo. Isso evita telas misturadas e deixa o `t()` síncrono e simples.
- Padrão é inglês. Valor inválido ou `localStorage` bloqueado (try/catch) cai no inglês.
- `en.ts` define o tipo `Messages`; `pt-BR.ts` e `es.ts` o satisfazem. Chave faltando ou sobrando quebra o typecheck, e há teste de paridade. Em runtime `t` cai para inglês e depois para a própria chave.
- Datas passam por `formatDateTime`, nunca `'pt-BR'` fixo.
- Textos só do processo principal do Electron (bandeja, diálogo de sair, notificações) continuam em pt-BR e ficam fora da migração.

## Armadilhas

- Texto resolvido em tempo de import: constante de módulo com `t()` ou string fixa congela o idioma antes de `initLocale()`. Use função (`professionLabel()`, `statusLabel()`...) chamada na hora de renderizar.
- Testes de texto precisam fixar o idioma: unitários com `setLocale(...)` e `afterEach` restaurando; e2e rodam em inglês (padrão) ou trocam pelo botão / gravando a chave no `localStorage` com `addInitScript`.
- Specs e2e editadas "às cegas" deixaram texto em pt-BR (`1 agente`, `Não gera cartões`, `retoma a sessão anterior`, `planejamento`). Depois de migrar texto, rode o e2e ou procure por acentos e palavras em português nas asserções.
- O painel Hooks pode ser testado no browser comum com uma ponte falsa (`window.agentsOfficeDesktop = { desktop: true, hooks: { status } }` via `addInitScript`). Sessões e Elenco só existem com as pontes reais (app desktop).
- Em e2e, comparar "sem texto de outro idioma" só com frases que diferem entre os idiomas (`Instalar hooks` é igual em pt-BR e es).
- `xvfb-run` pode não existir na máquina; o e2e desktop (`--project=desktop`) precisa de display. Com `DISPLAY` real o app abriu mas `firstWindow()` expirou (ambiente Wayland), então não foi possível rodar. O build empacotado em `packages/desktop/release` pode estar velho: force `AGENTS_OFFICE_E2E_APP=dev`.
- E2E web que falharam e não tocam em texto (causa não investigada, provavelmente anteriores ao i18n): "12. Hooks button..." (botão agora está na corner bar, `position` não é `absolute`), "14. terminal dock", "17. the room door", "message visit".
