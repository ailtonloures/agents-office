import { defineConfig } from '@playwright/test';

// Web and desktop tests spawn their own daemon (random port, temporary projects dir). Only the
// landing project needs a server: the built landing page served by `vite preview`.
const LANDING_PORT = 4399;
const desktopOnly = process.argv.some(
  (arg) => arg === 'desktop' || arg.includes('--project=desktop'),
);

export default defineConfig({
  outputDir: './test-results',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    headless: true,
    viewport: { width: 1280, height: 720 },
    trace: 'retain-on-failure',
  },
  // Serves packages/landing/dist (run `pnpm build` first). Skipped for desktop-only runs.
  webServer: desktopOnly
    ? undefined
    : {
        command: `pnpm --filter @agents-office/landing exec vite preview --host 127.0.0.1 --port ${LANDING_PORT} --strictPort`,
        url: `http://127.0.0.1:${LANDING_PORT}/`,
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
      },
  projects: [
    // Browser e2e of the web app against a real daemon.
    {
      name: 'web',
      testDir: './tests',
      testIgnore: /landing\.spec\.ts/,
      use: { browserName: 'chromium' },
    },
    // Smoke e2e of the built landing page (no daemon).
    {
      name: 'landing',
      testDir: './tests',
      testMatch: /landing\.spec\.ts/,
      use: { browserName: 'chromium', baseURL: `http://127.0.0.1:${LANDING_PORT}` },
    },
    // The Electron app (packaged when built); needs a display, see desktop/desktop.spec.ts.
    { name: 'desktop', testDir: './desktop' },
  ],
});
