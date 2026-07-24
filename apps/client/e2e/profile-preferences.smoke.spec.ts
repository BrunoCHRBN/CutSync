import { expect, test } from '@playwright/test';

import {
  CLIENT_ONBOARDING_STORAGE_KEY,
  CLIENT_ONBOARDING_VERSION,
} from '../src/features/onboarding/client-onboarding-state';

const credentials = {
  email: process.env.CUTSYNC_E2E_CLIENT_EMAIL,
  password: process.env.CUTSYNC_E2E_CLIENT_PASSWORD,
};

const bypassOnboarding = async (page: import('@playwright/test').Page) => {
  await page.addInitScript(({ key, version }) => {
    window.localStorage.setItem(key, String(version));
  }, {
    key: CLIENT_ONBOARDING_STORAGE_KEY,
    version: CLIENT_ONBOARDING_VERSION,
  });
};

test('apresenta o onboarding uma vez e permite pular', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('client-onboarding-screen')).toBeVisible();
  await expect(page.getByTestId('client-onboarding-art-discover')).toBeVisible();
  await page.getByTestId('client-onboarding-skip').click();
  await expect(page.getByTestId('client-sign-in-screen')).toBeVisible();

  await page.reload();
  await expect(page.getByTestId('client-onboarding-screen')).toHaveCount(0);
  await expect(page.getByTestId('client-sign-in-screen')).toBeVisible();
});

test('mantém as rotas privadas do Client protegidas sem sessão', async ({ page }) => {
  await bypassOnboarding(page);
  for (const privatePath of ['/profile', '/explore', '/appointments', '/appointments/appointment-test', '/appointments/appointment-test/cancel', '/establishments/estudio-teste', '/booking/estudio-teste']) {
    await page.goto(privatePath);
    await expect(page.getByTestId('client-sign-in-screen')).toBeVisible();
    await expect(page.getByTestId('client-auth-config-message')).toHaveCount(0);
    await expect(page.getByTestId('client-sign-in-submit')).toBeEnabled();
  }
  await expect(page.getByTestId('client-profile-screen')).toHaveCount(0);
  await expect(page.getByTestId('client-discovery-screen')).toHaveCount(0);
  await expect(page.getByTestId('client-appointments-screen')).toHaveCount(0);
});

test('cliente consulta perfil e preferências sem alterar dados', async ({ page }) => {
  test.skip(!credentials.email || !credentials.password, 'Configure CUTSYNC_E2E_CLIENT_EMAIL e CUTSYNC_E2E_CLIENT_PASSWORD.');

  await bypassOnboarding(page);
  await page.goto('/sign-in');
  await expect(page.getByTestId('client-auth-config-message')).toHaveCount(0);
  await expect(page.getByTestId('client-sign-in-submit')).toBeEnabled();
  await page.getByTestId('client-sign-in-email').fill(credentials.email as string);
  await page.getByTestId('client-sign-in-password').fill(credentials.password as string);
  await page.getByTestId('client-sign-in-submit').click();

  await expect(page.getByTestId('client-app-shell')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('client-profile-load-error')).toHaveCount(0, { timeout: 20_000 });

  await page.getByTestId('client-open-introduction').click();
  await expect(page.getByTestId('client-introduction-screen')).toBeVisible();
  await page.getByTestId('client-introduction-close').click();
  await expect(page.getByTestId('client-app-shell')).toBeVisible();

  await page.getByTestId('client-open-profile').click();
  await expect(page.getByTestId('client-profile-screen')).toBeVisible();
  const profileEmail = page.getByTestId('client-profile-email');
  await expect(profileEmail).toHaveValue(credentials.email as string);
  await expect(profileEmail).not.toBeEditable();
  const currentName = await page.getByTestId('client-profile-name').inputValue();
  await page.getByTestId('client-profile-name').fill(currentName + ' 💈');
  await expect(page.getByTestId('client-profile-name')).toHaveValue(currentName);
  await expect(page.getByTestId('client-profile-error')).toContainText('Emojis não são permitidos');

  await page.goBack();
  await page.getByTestId('client-open-preferences').click();
  await expect(page.getByTestId('client-preferences-screen')).toBeVisible();
  await expect(page.getByRole('switch', { name: 'Notificações no celular' })).toBeEnabled();

  await page.goBack();
  await page.getByTestId('client-open-security').click();
  await expect(page.getByTestId('client-security-screen')).toBeVisible();
  await expect(page.getByTestId('client-request-password-reset')).toBeVisible();
  await expect(page.getByTestId('client-sign-out-button')).toBeVisible();
  await expect(page.getByTestId('client-account-deletion-explanation')).toBeVisible();
  const deletionButton = page.getByTestId('client-request-account-deletion');
  await expect(deletionButton).toBeVisible();
  if (await deletionButton.isEnabled()) {
    page.once('dialog', async (dialog) => { await dialog.dismiss(); });
    await deletionButton.click();
  }
});

test('cliente descobre estabelecimentos, serviços e profissionais sem gravar dados', async ({ page }) => {
  test.skip(!credentials.email || !credentials.password, 'Configure CUTSYNC_E2E_CLIENT_EMAIL e CUTSYNC_E2E_CLIENT_PASSWORD.');

  await bypassOnboarding(page);
  await page.goto('/sign-in');
  await page.getByTestId('client-sign-in-email').fill(credentials.email as string);
  await page.getByTestId('client-sign-in-password').fill(credentials.password as string);
  await page.getByTestId('client-sign-in-submit').click();
  await expect(page.getByTestId('client-app-shell')).toBeVisible({ timeout: 20_000 });

  await page.getByTestId('client-open-discovery').click();
  await expect(page.getByTestId('client-discovery-screen')).toBeVisible();
  await expect(page.getByTestId('client-discovery-error')).toHaveCount(0, { timeout: 20_000 });
  await expect(page.getByTestId('client-discovery-results')).toBeVisible({ timeout: 20_000 });

  const search = page.getByTestId('client-discovery-search');
  await search.fill('barbearia 💈');
  await expect(search).toHaveValue('');
  await expect(page.getByTestId('client-discovery-search-error')).toContainText('Emojis não são permitidos');

  await search.fill('<svg>teste</svg>');
  await expect(search).toHaveValue('');
  await expect(page.getByTestId('client-discovery-search-error')).toContainText('HTML ou SVG');

  await page.locator('[data-testid^="client-discovery-card-"]').first().click();
  await expect(page.getByTestId('client-establishment-detail-screen')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('client-establishment-name')).toBeVisible();
  await expect(page.getByTestId('client-establishment-services')).toBeVisible();
  await expect(page.getByTestId('client-establishment-professionals')).toBeVisible();
});

test('cliente consulta disponibilidade real e revisa o agendamento sem confirmar', async ({ page }) => {
  test.skip(!credentials.email || !credentials.password, 'Configure CUTSYNC_E2E_CLIENT_EMAIL e CUTSYNC_E2E_CLIENT_PASSWORD.');

  await bypassOnboarding(page);
  await page.goto('/sign-in');
  await page.getByTestId('client-sign-in-email').fill(credentials.email as string);
  await page.getByTestId('client-sign-in-password').fill(credentials.password as string);
  await page.getByTestId('client-sign-in-submit').click();
  await expect(page.getByTestId('client-app-shell')).toBeVisible({ timeout: 20_000 });

  await page.getByTestId('client-open-discovery').click();
  await expect(page.getByTestId('client-discovery-results')).toBeVisible({ timeout: 20_000 });
  await page.locator('[data-testid^="client-discovery-card-"]').first().click();
  await expect(page.getByTestId('client-establishment-detail-screen')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('client-establishment-start-booking').click();

  await expect(page.getByTestId('client-booking-screen')).toBeVisible({ timeout: 20_000 });
  await page.locator('[data-testid^="client-booking-service-"]').first().click();
  await expect(page.getByTestId('client-booking-professionals')).toBeVisible();
  await page.locator('[data-testid^="client-booking-professional-"]').first().click();

  const dateButtons = page.locator('[data-testid^="client-booking-date-"]');
  await expect(dateButtons.first()).toBeVisible();
  const dateCount = await dateButtons.count();
  let foundSlot = false;
  for (let index = 0; index < dateCount; index += 1) {
    await dateButtons.nth(index).click();
    await expect(
      page.locator('[data-testid^="client-booking-slot-"]').first()
        .or(page.getByTestId('client-booking-availability-empty'))
        .or(page.getByTestId('client-booking-availability-error')),
    ).toBeVisible({ timeout: 20_000 });
    if (await page.locator('[data-testid^="client-booking-slot-"]').count()) {
      foundSlot = true;
      break;
    }
  }

  expect(foundSlot).toBe(true);
  await page.locator('[data-testid^="client-booking-slot-"]').first().click();
  await expect(page.getByTestId('client-booking-review')).toBeVisible();
  await expect(page.getByTestId('client-booking-confirm')).toBeEnabled();
  await expect(page.getByTestId('client-booking-success')).toHaveCount(0);
});

test('cliente consulta próximos, histórico e detalhe sem alterar o atendimento', async ({ page }) => {
  test.skip(!credentials.email || !credentials.password, 'Configure CUTSYNC_E2E_CLIENT_EMAIL e CUTSYNC_E2E_CLIENT_PASSWORD.');

  await bypassOnboarding(page);
  await page.goto('/sign-in');
  await page.getByTestId('client-sign-in-email').fill(credentials.email as string);
  await page.getByTestId('client-sign-in-password').fill(credentials.password as string);
  await page.getByTestId('client-sign-in-submit').click();
  await expect(page.getByTestId('client-app-shell')).toBeVisible({ timeout: 20_000 });

  await page.goto('/appointments');
  await expect(page.getByTestId('client-appointments-screen')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('client-appointments-error')).toHaveCount(0, { timeout: 20_000 });
  const cards = page.locator('[data-testid^="client-appointment-card-"]');
  await expect(cards.first()).toBeVisible({ timeout: 20_000 });

  await cards.first().click();
  await expect(page.getByTestId('client-appointment-detail-screen')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('client-appointment-detail-establishment')).toBeVisible();

  await page.goBack();
  await page.getByTestId('client-appointments-history-tab').click();
  await expect(page.getByTestId('client-appointments-tabs')).toBeVisible();
});

test('cliente abre cancelamento e reagendamento sem confirmar alterações', async ({ page }) => {
  test.skip(!credentials.email || !credentials.password, 'Configure CUTSYNC_E2E_CLIENT_EMAIL e CUTSYNC_E2E_CLIENT_PASSWORD.');

  await bypassOnboarding(page);
  await page.goto('/sign-in');
  await page.getByTestId('client-sign-in-email').fill(credentials.email as string);
  await page.getByTestId('client-sign-in-password').fill(credentials.password as string);
  await page.getByTestId('client-sign-in-submit').click();
  await expect(page.getByTestId('client-app-shell')).toBeVisible({ timeout: 20_000 });

  await page.goto('/appointments');
  const cards = page.locator('[data-testid^="client-appointment-card-"]');
  await expect(cards.first()).toBeVisible({ timeout: 20_000 });
  await cards.first().click();
  await expect(page.getByTestId('client-appointment-detail-screen')).toBeVisible({ timeout: 20_000 });

  const cancelButton = page.getByTestId('client-appointment-cancel');
  const rescheduleButton = page.getByTestId('client-appointment-reschedule');
  test.skip(
    await cancelButton.count() === 0 || await rescheduleButton.count() === 0,
    'O atendimento da credencial E2E está fora da janela de alteração.',
  );

  await cancelButton.click();
  await expect(page.getByTestId('client-appointment-cancel-screen')).toBeVisible();
  await page.locator('[data-testid^="client-appointment-cancel-reason-"]').first().click();
  await page.getByTestId('client-appointment-cancel-continue').click();
  await expect(page.getByTestId('client-appointment-cancel-confirmation')).toBeVisible();
  await expect(page.getByTestId('client-appointment-cancel-submit')).toBeEnabled();
  await page.goBack();

  await rescheduleButton.click();
  await expect(page.getByTestId('client-booking-reschedule')).toBeVisible({ timeout: 20_000 });
  const dateButtons = page.locator('[data-testid^="client-booking-date-"]');
  const dateCount = await dateButtons.count();
  let foundSlot = false;
  for (let index = 0; index < dateCount; index += 1) {
    await dateButtons.nth(index).click();
    await expect(
      page.locator('[data-testid^="client-booking-slot-"]').first()
        .or(page.getByTestId('client-booking-availability-empty'))
        .or(page.getByTestId('client-booking-availability-error')),
    ).toBeVisible({ timeout: 20_000 });
    if (await page.locator('[data-testid^="client-booking-slot-"]').count()) {
      foundSlot = true;
      break;
    }
  }
  expect(foundSlot).toBe(true);
  await page.locator('[data-testid^="client-booking-slot-"]').first().click();
  await expect(page.getByTestId('client-booking-review')).toBeVisible();
  await expect(page.getByTestId('client-booking-confirm')).toBeEnabled();
  await expect(page.getByTestId('client-booking-success')).toHaveCount(0);
});
