import { defineConfig } from '@playwright/test';

// Smoke tests of the real Electron app. They need a display (X11/Wayland, or xvfb-run in CI).
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  outputDir: './test-results',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
});
