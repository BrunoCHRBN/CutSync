import { expect, test } from '@playwright/test';

const credentials = {
  email: process.env.CUTSYNC_E2E_CLIENT_EMAIL,
  password: process.env.CUTSYNC_E2E_CLIENT_PASSWORD,
};

test('mantém as rotas privadas do Client protegidas sem sessão', async ({ page }) => {
  for (const privatePath of ['/profile', '/explore', '/establishments/estudio-teste']) {
    await page.goto(privatePath);
    await expect(page.getByTestId('client-sign-in-screen')).toBeVisible();
    await expect(page.getByTestId('client-auth-config-message')).toHaveCount(0);
    await expect(page.getByTestId('client-sign-in-submit')).toBeEnabled();
  }
  await expect(page.getByTestId('client-profile-screen')).toHaveCount(0);
  await expect(page.getByTestId('client-discovery-screen')).toHaveCount(0);
});

test('cliente consulta perfil e preferências sem alterar dados', async ({ page }) => {
  test.skip(!credentials.email || !credentials.password, 'Configure CUTSYNC_E2E_CLIENT_EMAIL e CUTSYNC_E2E_CLIENT_PASSWORD.');

  await page.goto('/sign-in');
  await expect(page.getByTestId('client-auth-config-message')).toHaveCount(0);
  await expect(page.getByTestId('client-sign-in-submit')).toBeEnabled();
  await page.getByTestId('client-sign-in-email').fill(credentials.email as string);
  await page.getByTestId('client-sign-in-password').fill(credentials.password as string);
  await page.getByTestId('client-sign-in-submit').click();

  await expect(page.getByTestId('client-app-shell')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('client-profile-load-error')).toHaveCount(0, { timeout: 20_000 });

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
  await expect(page.getByRole('switch', { name: 'Notificações no celular' })).toBeDisabled();

  await page.goBack();
  await page.getByTestId('client-open-security').click();
  await expect(page.getByTestId('client-security-screen')).toBeVisible();
  await expect(page.getByTestId('client-request-password-reset')).toBeVisible();
  await expect(page.getByTestId('client-sign-out-button')).toBeVisible();
});

test('cliente descobre estabelecimentos, serviços e profissionais sem gravar dados', async ({ page }) => {
  test.skip(!credentials.email || !credentials.password, 'Configure CUTSYNC_E2E_CLIENT_EMAIL e CUTSYNC_E2E_CLIENT_PASSWORD.');

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
