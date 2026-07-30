import { expect, test } from '@playwright/test';

test('exibe o acesso privado sem overflow horizontal', async ({ page }) => {
  await page.goto('/login');

  await expect(page.getByText('CutSync Control', { exact: true })).toBeVisible();

  const emailInput = page.getByPlaceholder('voce@empresa.com');
  const passwordInput = page.getByPlaceholder('Sua senha');
  const submitButton = page.getByRole('button', {
    name: 'Entrar com segurança',
  });

  await expect(emailInput).toBeVisible();
  await expect(passwordInput).toBeVisible();
  await expect(submitButton).toBeVisible();
  await expect(submitButton).toBeDisabled();

  const horizontalOverflow = await page.evaluate(() => {
    const documentWidth = Math.max(
      document.documentElement.scrollWidth,
      document.body.scrollWidth,
    );

    return documentWidth > window.innerWidth;
  });

  expect(horizontalOverflow).toBe(false);
});
