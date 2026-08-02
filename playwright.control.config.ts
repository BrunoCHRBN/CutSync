import { defineConfig, devices } from '@playwright/test';

const viewports = [
  ['phone-390', { width: 390, height: 844 }],
  ['tablet-landscape-1024', { width: 1024, height: 768 }],
  ['desktop-1440', { width: 1440, height: 900 }],
] as const;

const useStaticExport = process.env.CUTSYNC_CONTROL_E2E_MODE === 'static';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /control-.*\.spec\.ts/,
  outputDir: 'test-results/control',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL:
      process.env.CUTSYNC_CONTROL_E2E_BASE_URL || 'http://127.0.0.1:8083',
    colorScheme: 'light',
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    trace: 'retain-on-failure',
  },
  projects: viewports.map(([name, viewport]) => ({
    name,
    use: { viewport },
  })),
  webServer: process.env.CUTSYNC_CONTROL_E2E_BASE_URL
    ? undefined
    : useStaticExport
      ? {
          command:
            'node scripts/build-and-serve-control-cloud.mjs',
          url: 'http://127.0.0.1:8083/cloud/login',
          reuseExistingServer: !process.env.CI,
          timeout: 300_000,
        }
      : {
          command:
            'npm --workspace @cutsync/control run start -- --port 8083',
          url: 'http://127.0.0.1:8083/login',
          reuseExistingServer: !process.env.CI,
          timeout: 180_000,
        },
});
