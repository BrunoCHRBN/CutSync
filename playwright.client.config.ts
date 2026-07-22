import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './apps/client/e2e',
  outputDir: 'test-results/client',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: process.env.CUTSYNC_CLIENT_E2E_BASE_URL || 'http://127.0.0.1:8082',
    colorScheme: 'light',
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    trace: 'retain-on-failure',
    viewport: { width: 390, height: 844 },
  },
  webServer: process.env.CUTSYNC_CLIENT_E2E_BASE_URL
    ? undefined
    : {
        command: 'npm --workspace @cutsync/client run build:web:e2e && npm --workspace @cutsync/client run serve:test',
        url: 'http://127.0.0.1:8082/sign-in',
        reuseExistingServer: false,
        timeout: 180_000,
      },
});
