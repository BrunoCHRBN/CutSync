import { expect, test } from '@playwright/test';

test('landing cliente — segmentação, busca e navegação de negócio', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('client-public-landing')).toBeVisible();
  await expect(page.getByTestId('landing-audience-selector')).toBeVisible();

  await page.getByTestId('landing-hero-client-cta').click();
  await expect(page.getByTestId('landing-search-input')).toBeFocused();

  await page.getByTestId('landing-audience-observer').click();
  await expect(page).toHaveURL(/audience=observer/);
  await page.getByTestId('landing-search-input').fill('corte');
  await expect(page.getByTestId('landing-results-count')).toBeVisible();

  await page.getByTestId('landing-audience-business').click();
  await expect(page).toHaveURL(/audience=business/);
  await expect(page.getByTestId('landing-business-cta')).toBeVisible();
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
});

test('landing respeita movimento reduzido', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('client-public-landing')).toBeVisible();
  await page.getByTestId('landing-audience-observer').click();
  await expect(page).toHaveURL(/audience=observer/);
});
