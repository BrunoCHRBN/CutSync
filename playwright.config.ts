import { defineConfig, devices } from '@playwright/test';

const viewports = [
  ['phone-390', { width: 390, height: 844 }],
  ['tablet-768', { width: 768, height: 1024 }],
  ['tablet-landscape-1024', { width: 1024, height: 768 }],
  ['desktop-1440', { width: 1440, height: 900 }],
  ['desktop-1920', { width: 1920, height: 1080 }],
] as const;

export default defineConfig({
  testDir: './tests',
  outputDir: 'test-results',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  expect: {
    toHaveScreenshot: {
      animations: 'disabled',
      caret: 'hide',
      maxDiffPixelRatio: 0.015,
    },
  },
  use: {
    baseURL: process.env.CUTSYNC_E2E_BASE_URL || 'http://127.0.0.1:8081',
    colorScheme: 'light',
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
  },
  projects: [
    { name: 'unit', testMatch: /.*\.unit\.spec\.ts/ },
    ...viewports.map(([name, viewport]) => ({
      name,
      testIgnore: /.*\.unit\.spec\.ts/,
      use: { viewport },
    })),
  ],
  webServer: process.env.CUTSYNC_E2E_BASE_URL
    ? undefined
    : {
        command: 'npm run serve:test',
        url: 'http://127.0.0.1:8081/login',
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      },
});
