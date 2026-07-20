import { expect, Page, test } from '@playwright/test';

const accounts = {
  admin: {
    email: process.env.CUTSYNC_E2E_ADMIN_EMAIL,
    password: process.env.CUTSYNC_E2E_ADMIN_PASSWORD,
  },
  professional: {
    email: process.env.CUTSYNC_E2E_PROFESSIONAL_EMAIL,
    password: process.env.CUTSYNC_E2E_PROFESSIONAL_PASSWORD,
  },
  client: {
    email: process.env.CUTSYNC_E2E_CLIENT_EMAIL,
    password: process.env.CUTSYNC_E2E_CLIENT_PASSWORD,
  },
};

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.getByTestId('login-email-input').fill(email);
  await page.getByTestId('login-password-input').fill(password);
  await page.getByTestId('login-submit-button').click();
  await expect(page.getByTestId('login-screen')).toBeHidden({ timeout: 20_000 });
}

test('login — baseline visual e navegação por teclado', async ({ page }) => {
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('login-screen')).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.getByTestId('login-email-input')).toBeFocused();
  await expect(page).toHaveScreenshot('login.png', { fullPage: true });
});

test.describe('admin', () => {
  test.skip(!accounts.admin.email || !accounts.admin.password, 'Configure as variáveis CUTSYNC_E2E_ADMIN_*');

  test.beforeEach(async ({ page }) => signIn(page, accounts.admin.email!, accounts.admin.password!));

  for (const [route, name, testId] of [
    ['/admin', 'admin-calendar.png', 'admin-dashboard-screen'],
    ['/settings', 'admin-settings.png', 'settings-screen'],
  ] as const) {
    test(`${route} — baseline visual`, async ({ page }) => {
      await page.goto(route);
      await expect(page.getByTestId(testId)).toBeVisible();
      await expect(page).toHaveScreenshot(name, { fullPage: true });
    });
  }
});

test.describe('profissional', () => {
  test.skip(!accounts.professional.email || !accounts.professional.password, 'Configure as variáveis CUTSYNC_E2E_PROFESSIONAL_*');

  test('agenda — baseline visual', async ({ page }) => {
    await signIn(page, accounts.professional.email!, accounts.professional.password!);
    await page.goto('/professional');
    await expect(page.getByTestId('barber-dashboard-screen')).toBeVisible();
    await expect(page).toHaveScreenshot('professional-calendar.png', { fullPage: true });
  });
});

test.describe('cliente', () => {
  test.skip(!accounts.client.email || !accounts.client.password, 'Configure as variáveis CUTSYNC_E2E_CLIENT_*');

  test.beforeEach(async ({ page }) => signIn(page, accounts.client.email!, accounts.client.password!));

  for (const [route, name, testId] of [
    ['/explore', 'client-explore.png', 'client-explore-screen'],
    ['/appointments', 'client-appointments.png', 'client-appointments-screen'],
  ] as const) {
    test(`${route} — baseline visual`, async ({ page }) => {
      await page.goto(route);
      await expect(page.getByTestId(testId)).toBeVisible();
      await expect(page).toHaveScreenshot(name, { fullPage: true });
    });
  }

  test('perfil público e booking — baseline visual', async ({ page }) => {
    const slug = process.env.CUTSYNC_E2E_PUBLIC_SLUG;
    test.skip(!slug, 'Configure CUTSYNC_E2E_PUBLIC_SLUG');
    await page.goto(`/${slug}`);
    await expect(page.getByTestId('barbershop-profile-screen')).toBeVisible();
    await expect(page).toHaveScreenshot('public-profile.png', { fullPage: true });
    await page.goto(`/${slug}/booking`);
    await expect(page.getByTestId('booking-screen')).toBeVisible();
    await expect(page).toHaveScreenshot('booking.png', { fullPage: true });
  });
});
