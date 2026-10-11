import { defineConfig } from '@playwright/test';

// Each test spawns its own daemon (random port, temporary projects dir), so no webServer here.
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
  projects: [
    // Browser e2e of the web app against a real daemon.
    { name: 'web', testDir: './tests', use: { browserName: 'chromium' } },
    // The Electron app (packaged when built); needs a display, see desktop/desktop.spec.ts.
    { name: 'desktop', testDir: './desktop' },
  ],
});
