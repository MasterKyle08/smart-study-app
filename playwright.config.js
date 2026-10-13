const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/ui',
  workers: 1,
  fullyParallel: false,
  timeout: 30000,
  reporter: 'list',
  outputDir: '.local/artifacts/ui-results',
  use: {
    baseURL: 'http://127.0.0.1:4180',
    headless: true,
    viewport: { width: 1440, height: 1000 },
    channel: process.env.PLAYWRIGHT_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined),
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node backend/tests/browser-server.js',
    url: 'http://127.0.0.1:4180/health',
    reuseExistingServer: false,
    timeout: 30000,
  },
});
