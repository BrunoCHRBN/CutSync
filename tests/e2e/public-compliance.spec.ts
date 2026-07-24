import { expect, test } from '@playwright/test';

test('publica política de privacidade e caminho externo de exclusão', async ({ page }) => {
  await page.goto('/privacy');
  await expect(page.getByTestId('public-privacy-page')).toBeVisible();
  await expect(page.getByText('com.cutsync.client')).toBeVisible();
  await page.getByTestId('privacy-account-deletion-link').click();

  await expect(page.getByTestId('public-account-deletion-page')).toBeVisible();
  await expect(page.getByTestId('account-deletion-sign-in')).toBeVisible();
  await expect(page.getByTestId('account-deletion-start')).toHaveCount(0);
});
