# Landing page comercial (specs 106-115, 120-122)

- Pacote `packages/landing`: Vite 7 + React 19, site estático. Não é dependência de `packages/cli` e não toca as skins do web.
- i18n próprio (en/pt-BR/es), idioma salvo em `localStorage` na chave `agents-office-landing.locale`. Não reutiliza o i18n do web.
- Escritório pixel art: lógica pura em `src/pixel/officeLogic.ts` (relógio injetado, testável) e renderer de canvas separado.
- Sprites são CÓPIAS de `packages/web/public/skins/default` em `packages/landing/public/sprites` (CC0, com `LICENSES.md` próprio). Nunca editar a cópia; recopiar da skin. Pesam ~59KB.
- Fonte VT323 (OFL) em TTF em `public/fonts`; sem ferramenta de woff2 disponível, então o payload inicial fica em ~304KB.
- SEO: `build/seoPlugin.ts` guiado por `VITE_SITE_URL` (canonical, OG, JSON-LD, `robots.txt`, `sitemap.xml` em `dist`). Padrão `https://agents-office.vercel.app`.
- `og.png` e `apple-touch-icon.png` vêm de `scripts/generate-social-images.mjs`, que empresta o Playwright do pacote `e2e` (sem dependência nova). Rodar à mão quando logo/fonte/imagem mudarem.
- Qualidade medida no preview: Lighthouse 98/100/100/100 e axe sem violações.

## Armadilhas

- Animações de reveal geram falsos positivos de contraste no axe: esperar ~1,5s antes de rodar. O hero usa `Reveal` com `eager`.
- Screenshots full-page do Playwright precisam rolar a página antes, senão as seções com reveal saem vazias.
- E2E: `pnpm build && pnpm --filter @agents-office/e2e exec playwright test --project=landing`. O projeto `landing` usa `vite preview` na porta 4399; os projetos web/desktop ignoram `landing.spec.ts`.

## Vercel no monorepo

- Criar o projeto com Root Directory = `packages/landing` e a env `VITE_SITE_URL`.
- Como o lockfile e o workspace ficam na raiz, `vercel.json` usa `cd ../.. && pnpm install --frozen-lockfile --filter @agents-office/landing...` (só o landing; evita Electron/node-pty/Playwright, validado em cópia limpa: install em ~4s) e `cd ../.. && pnpm --filter @agents-office/landing build`; saída `dist`.
- Cache imutável só em `/assets` (nomes com hash). `/fonts` e `/sprites` não têm hash, então ficam sem cache imutável.
- Deploy automático via Git: importar o repo na Vercel, Root Directory `packages/landing`, "Include source files outside of the Root Directory" ligado, branch de produção `main`, Node 20.x/22.x, `VITE_SITE_URL` com o domínio real. `packages/landing/test/vercel.test.ts` protege o `vercel.json`.
- `.vercel/` está no `.gitignore`. Deploy (preview ou produção) só por decisão explícita do usuário.
- Vercel Web Analytics: `<Analytics />` de `@vercel/analytics/react` em `src/main.tsx` (o import `/next` é só para Next.js). Só reporta em deploy na Vercel (no `vite dev` não faz nada) e exige habilitar Analytics no dashboard do projeto. O script vem de `/_vercel/insights/script.js`, mesma origem, então não há CSP a ajustar.
- Ainda não existe release no GitHub: os links de Download só resolvem depois que uma for publicada.

## Release real e regra de conteúdo (specs 120-122)

- A landing só promete o que a release publica. O workflow `release.yml` publica apenas Linux: AppImage, `.deb` e `latest-linux.yml`. Não há artefato de macOS; a landing não o menciona como suportado (instalação, JSON-LD `operatingSystem`, copy).
- Nomes reais (`artifactName` = `agents-office-${version}-${os}-${arch}.${ext}`): `agents-office-<versão>-linux-x86_64.AppImage` e `agents-office-<versão>-linux-amd64.deb`. O `x86_64` (AppImage) e o `amd64` (deb) diferem por convenção do electron-builder; não normalizar.
- Só o AppImage se atualiza sozinho; o `.deb` é instalação manual.
- A landing explica os dois modos: passivo (lê os transcripts, sem hooks) e ativo (hooks instalados, `npx agents-office hooks install`).
- Verificação final: `pnpm --filter @agents-office/landing build`, inspecionar `dist/index.html` (meta, canonical, JSON-LD só Linux) e rodar `pnpm exec playwright test --project=landing`.
- `ARCHITECTURE.md` ainda cita um job de macOS que não existe no workflow (pendente de correção em spec própria).
