import { expect, type Locator, type Page, test } from '@playwright/test';

const LOCALE_KEY = 'agents-office-landing.locale';
const COMMAND = 'chmod +x agents-office-*-linux-x86_64.AppImage';
const REPO_URL = 'https://github.com/ailtonloures/agents-office';

const TITLES = {
  en: 'Agents Office - watch and orchestrate your Claude Code agents',
  'pt-BR': 'Agents Office - observe e orquestre seus agentes do Claude Code',
  es: 'Agents Office - observa y orquesta tus agentes de Claude Code',
} as const;

const NAV_SELECT = { en: 'Choose the language', ptBR: 'Escolha o idioma' };

// Fresh storage per test so a saved locale never leaks between them.
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate((key) => localStorage.removeItem(key), LOCALE_KEY);
  await page.reload();
});

/** The footer select is always visible, unlike the nav one that hides behind the phone menu. */
function footerSelect(page: Page) {
  return page.getByLabel(/^(Choose the language|Escolha o idioma|Elige el idioma) \(/i).last();
}

test('language switch updates title, html[lang] and persists after reload', async ({ page }) => {
  await expect(page).toHaveTitle(TITLES.en);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');

  const select = page.locator('select.lang-switch__select').last();
  await select.scrollIntoViewIfNeeded();

  await select.selectOption('pt-BR');
  await expect(page).toHaveTitle(TITLES['pt-BR']);
  await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR');

  await page.reload();
  await expect(page).toHaveTitle(TITLES['pt-BR']);
  await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR');

  await page.locator('select.lang-switch__select').last().selectOption('es');
  await expect(page).toHaveTitle(TITLES.es);
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');

  await page.reload();
  await expect(page).toHaveTitle(TITLES.es);
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');

  await page.locator('select.lang-switch__select').last().selectOption('en');
  await expect(page).toHaveTitle(TITLES.en);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  expect(await page.evaluate((key) => localStorage.getItem(key), LOCALE_KEY)).toBe('en');
});

test('the nav language select is labelled and the footer one is distinct', async ({ page }) => {
  await expect(page.getByLabel(NAV_SELECT.en, { exact: true })).toHaveCount(1);
  await expect(footerSelect(page)).toHaveCount(1);
});

test('copy button puts the install command on the clipboard and confirms', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const snippet = page.locator('#install .command-snippet').first();
  await expect(snippet.locator('code')).toContainText(COMMAND);

  await snippet.getByRole('button', { name: 'Copy the command' }).click();
  await expect(snippet.getByRole('status')).toHaveText('Copied');
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(COMMAND);

  // The confirmation is translated too.
  await page.locator('select.lang-switch__select').last().selectOption('pt-BR');
  await snippet.locator('button').click();
  await expect(snippet.getByRole('status')).toHaveText('Copiado');
});

test('hero CTAs point to the releases and the repository', async ({ page }) => {
  const hero = page.locator('#top, .hero').first();
  const download = hero.getByRole('link', { name: 'Download' });
  const star = hero.getByRole('link', { name: 'Star on GitHub' });
  await expect(download).toHaveAttribute('href', `${REPO_URL}/releases/latest`);
  await expect(star).toHaveAttribute('href', REPO_URL);
  await expect(download).toHaveAttribute('rel', /noopener/);
  await expect(star).toHaveAttribute('rel', /noopener/);
});

test('hero canvas is present and has drawn pixels', async ({ page }) => {
  const canvas = page.locator('.hero canvas');
  await expect(canvas).toBeVisible();
  await expect(page.locator('.hero [role="img"]')).toHaveAttribute('aria-label', /.+/);

  await expect
    .poll(() => drawnColors(canvas), {
      message: 'canvas should contain several distinct opaque colors',
    })
    .toBeGreaterThan(3);
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('the canvas shows a static frame', async ({ page }) => {
    const canvas = page.locator('.hero canvas');
    await expect(canvas).toBeVisible();
    await expect.poll(() => drawnColors(canvas)).toBeGreaterThan(3);

    const first = await canvas.evaluate((el) => (el as HTMLCanvasElement).toDataURL());
    // Several animation frames later nothing may have changed.
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          let frames = 0;
          const tick = () => (++frames >= 30 ? resolve() : requestAnimationFrame(tick));
          requestAnimationFrame(tick);
        }),
    );
    const second = await canvas.evaluate((el) => (el as HTMLCanvasElement).toDataURL());
    expect(second).toBe(first);
  });
});

test.describe('phone viewport', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('has no horizontal scroll', async ({ page }) => {
    await expect(page.locator('h1')).toBeVisible();
    const overflow = () =>
      page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        inner: window.innerWidth,
      }));
    const top = await overflow();
    expect(top.scroll).toBeLessThanOrEqual(top.inner);

    // Same in the other languages, whose strings are longer.
    for (const code of ['pt-BR', 'es']) {
      await page.locator('select.lang-switch__select').last().selectOption(code);
      await expect(page.locator('html')).toHaveAttribute('lang', code);
      const size = await overflow();
      expect(size.scroll).toBeLessThanOrEqual(size.inner);
    }
  });

  test('the menu toggle button keeps its position when the menu opens and closes', async ({
    page,
  }) => {
    const toggle = page.locator('.nav__toggle');
    const y = async () => (await toggle.boundingBox())?.y;
    const closedY = await y();
    expect(closedY).toBeDefined();

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(await y()).toBe(closedY);

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(await y()).toBe(closedY);
  });
});

/** Counts distinct opaque colors, sampling the canvas; 0 when blank or fully transparent. */
function drawnColors(canvas: Locator): Promise<number> {
  // Runs in the page, so it must not reference anything from this module.
  return canvas.evaluate((el) => {
    const c = el as HTMLCanvasElement;
    const ctx = c.getContext('2d');
    if (!ctx || c.width === 0 || c.height === 0) return 0;
    const { data } = ctx.getImageData(0, 0, c.width, c.height);
    const colors = new Set<number>();
    for (let i = 0; i < data.length; i += 4 * 7) {
      if ((data[i + 3] ?? 0) === 0) continue;
      colors.add(((data[i] ?? 0) << 16) | ((data[i + 1] ?? 0) << 8) | (data[i + 2] ?? 0));
      if (colors.size > 50) break;
    }
    return colors.size;
  });
}
