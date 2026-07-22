import { expect, test } from '@playwright/test';

test('landing cliente — segmentação, busca e navegação de negócio', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('client-public-landing')).toBeVisible();
  await expect(page.getByTestId('landing-audience-selector')).toBeVisible();

  await page.getByTestId('landing-audience-observer').click();
  await expect(page).toHaveURL(/audience=observer/);
  await page.getByTestId('landing-search-input').fill('corte');
  await expect(page.getByTestId('landing-results-count')).toBeVisible();

  await page.getByTestId('landing-audience-business').click();
  await expect(page).toHaveURL(/audience=business/);
  await expect(page.getByTestId('landing-business-cta')).toBeVisible();
});

test('landing estabelecimento — sandbox acessível e preços em validação', async ({ page }) => {
  await page.goto('/para-estabelecimentos', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('business-public-landing')).toBeVisible();
  await page.getByTestId('business-sandbox-tab-commissions').click();
  await expect(page.getByTestId('business-sandbox-tab-commissions')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('PREÇO EM VALIDAÇÃO').first()).toBeVisible();
});

test('landing respeita movimento reduzido', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('client-public-landing')).toBeVisible();
  await page.getByTestId('landing-audience-observer').click();
  await expect(page).toHaveURL(/audience=observer/);
});

