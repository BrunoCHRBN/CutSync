import { expect, test } from '@playwright/test';

test('landing cliente — busca e navegação explícita de negócio', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('client-public-landing')).toBeVisible();
  await expect(page.getByTestId('landing-audience-selector')).toHaveCount(0);
  await expect(page).toHaveTitle('CutSync — Encontre serviços e agende seu horário');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/$/);

  await page.getByTestId('landing-hero-client-cta').click();
  await expect(page.getByTestId('landing-search-input')).toBeFocused();
  await page.getByTestId('landing-search-input').fill('corte');
  await expect(page.getByTestId('landing-results-count')).toBeVisible();
  await expect(page.locator('body')).not.toContainText(/recomendad[oa]s?|populares?/i);

  await page.getByTestId('landing-hero-client-secondary-cta').click();
  await expect(page.getByTestId('landing-client-journey')).toBeVisible();

  await page.getByTestId('landing-business-link').click();
  await expect(page).toHaveURL(/\/para-estabelecimentos$/);
  await expect(page.getByTestId('business-public-landing')).toBeVisible();
});

test('landing cliente — seletor orienta os três caminhos de acesso', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByTestId('landing-account-button').click();
  await expect(page.getByTestId('access-path-modal')).toBeVisible();
  await expect(page.getByTestId('access-path-client')).toBeFocused();

  if ((page.viewportSize()?.width ?? 0) < 760) {
    await expect(page.getByTestId('access-path-modal-mobile')).toBeVisible();
  } else {
    await expect(page.getByTestId('access-path-modal-desktop')).toBeVisible();
  }

  await page.keyboard.press('Escape');
  await expect(page.getByTestId('access-path-modal')).toBeHidden();

  await page.getByTestId('landing-account-button').click();
  await page.getByTestId('access-path-client').click();
  await expect(page).toHaveURL(/\/login\?audience=client$/);

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByTestId('landing-account-button').click();
  await page.getByTestId('access-path-business').click();
  await expect(page).toHaveURL(/\/login\?audience=business$/);

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByTestId('landing-account-button').click();
  await page.getByTestId('access-path-establishment').click();
  await expect(page).toHaveURL(/\/register\?/);
  const registrationUrl = new URL(page.url());
  expect(registrationUrl.searchParams.get('intent')).toBe('establishment');
  expect(registrationUrl.searchParams.get('redirect')).toBe('/(client)/request-establishment');
});

test('landing cliente — seletor fecha pelo fundo', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByTestId('landing-account-button').click();
  await page.getByTestId('access-path-backdrop').click({ position: { x: 8, y: 8 } });
  await expect(page.getByTestId('access-path-modal')).toBeHidden();
  await expect(page.getByTestId('landing-account-button')).toBeFocused();
});

test('landing cliente — normaliza links antigos de audiência', async ({ page }) => {
  await page.goto('/?audience=business', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/para-estabelecimentos$/);

  await page.goto('/?audience=observer', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId('client-public-landing')).toBeVisible();
});

test('landing estabelecimento — demonstra somente funções disponíveis', async ({ page }) => {
  await page.goto('/para-estabelecimentos', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('business-public-landing')).toBeVisible();
  await expect(page).toHaveTitle('CutSync para estabelecimentos — Vitrine e agenda conectadas');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/para-estabelecimentos$/);
  await expect(page.locator('[data-testid="business-public-landing"]').getByText(/dados fictícios/i)).toHaveCount(1);
  await expect(page.getByText(/dados fictícios/i)).not.toBeInViewport();
  await page.getByTestId('business-demo-cta').click();
  await expect(page.getByTestId('business-sandbox-tab-agenda')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('business-agenda-demo')).toBeVisible();

  await page.getByTestId('business-sandbox-tab-services').click();
  await expect(page.getByTestId('business-sandbox-tab-services')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('business-services-demo')).toBeVisible();

  await page.getByTestId('business-sandbox-tab-team').click();
  await expect(page.getByTestId('business-sandbox-tab-team')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('business-team-demo')).toBeVisible();
  await expect(page.getByText('PREÇO EM VALIDAÇÃO')).toHaveCount(0);
  await expect(page.getByTestId('business-comparison')).toContainText('Vitrine pública');
  await expect(page.locator('body')).not.toContainText(/troca de emergência|ausência detectada|auto-?ativação imediata|repasse automatizado|pix liberado|simulador real/i);
});

test('landing estabelecimento — ações explícitas não abrem o seletor', async ({ page }) => {
  await page.goto('/para-estabelecimentos', { waitUntil: 'domcontentloaded' });
  await page.getByTestId('business-login-button').click();
  await expect(page).toHaveURL(/\/login\?audience=business$/);
  await expect(page.getByTestId('access-path-modal')).toHaveCount(0);

  await page.goto('/para-estabelecimentos', { waitUntil: 'domcontentloaded' });
  await page.getByTestId('business-primary-cta').click();
  await expect(page).toHaveURL(/\/register\?/);
  const registrationUrl = new URL(page.url());
  expect(registrationUrl.searchParams.get('intent')).toBe('establishment');
  expect(registrationUrl.searchParams.get('redirect')).toBe('/(client)/request-establishment');
});

test('landing respeita movimento reduzido', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('client-public-landing')).toBeVisible();
  await page.getByTestId('landing-hero-client-cta').click();
  await expect(page.getByTestId('landing-search-input')).toBeFocused();
  await page.getByTestId('landing-account-button').click();
  await expect(page.getByTestId('access-path-modal')).toBeVisible();
});
