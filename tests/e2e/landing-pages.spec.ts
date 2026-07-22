import { expect, test } from '@playwright/test';

test('landing cliente — busca e navegação explícita de negócio', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('client-public-landing')).toBeVisible();
  await expect(page.getByTestId('landing-audience-selector')).toHaveCount(0);

  await page.getByTestId('landing-hero-client-cta').click();
  await expect(page.getByTestId('landing-search-input')).toBeFocused();
  await page.getByTestId('landing-search-input').fill('corte');
  await expect(page.getByTestId('landing-results-count')).toBeVisible();
  await expect(page.locator('body')).not.toContainText(/recomendad[oa]s?|populares?/i);

  await page.getByTestId('landing-business-link').click();
  await expect(page).toHaveURL(/\/para-estabelecimentos$/);
  await expect(page.getByTestId('business-public-landing')).toBeVisible();
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
  await expect(page.locator('body')).not.toContainText(/troca de emergência|ausência detectada|auto-?ativação imediata|repasse automatizado|pix liberado|simulador real/i);
});

test('landing respeita movimento reduzido', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('client-public-landing')).toBeVisible();
  await page.getByTestId('landing-hero-client-cta').click();
  await expect(page.getByTestId('landing-search-input')).toBeFocused();
});
