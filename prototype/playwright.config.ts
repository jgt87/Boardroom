import { defineConfig } from '@playwright/test';
const port = Number(process.env.BOARDROOM_TEST_PORT || 5199);

// Browser tests run against a dedicated loopback-only dev server on port 5199,
// using the locally installed Chrome (no browser download).
export default defineConfig({
  testDir: './e2e',
  testIgnore: ['**/.tmp/**'],
  globalSetup: './e2e/global-setup.ts',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  // Serial: media decoding and the performance budget are sensitive to a second browser running alongside.
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  outputDir: process.env.BOARDROOM_TEST_OUTPUT || 'test-results',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    channel: 'chrome',
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `node node_modules/vite/bin/vite.js --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}/`,
    reuseExistingServer: process.env.BOARDROOM_TEST_REUSE === '1',
    timeout: 120_000,
  },
});
