# Landing page comercial (specs 106-115)

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
- Como o lockfile e o workspace ficam na raiz, `vercel.json` usa `cd ../.. && pnpm install --frozen-lockfile` e `cd ../.. && pnpm --filter @agents-office/landing build`; saída `dist`.
- Cache imutável só em `/assets` (nomes com hash). `/fonts` e `/sprites` não têm hash, então ficam sem cache imutável.
- `.vercel/` está no `.gitignore`. Deploy (preview ou produção) só por decisão explícita do usuário.
- Ainda não existe release no GitHub: os links de Download só resolvem depois que uma for publicada.
