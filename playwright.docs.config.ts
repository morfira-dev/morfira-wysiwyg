import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/docs',
  outputDir: './test-results/docs',
  fullyParallel: true,
  use: { baseURL: 'http://127.0.0.1:4173', ...devices['Desktop Chrome'], trace: 'retain-on-failure' },
  webServer: { command: 'pnpm run docs:preview', url: 'http://127.0.0.1:4173', reuseExistingServer: !process.env.CI },
});
