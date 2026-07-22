import { expect, test } from '@playwright/test';

test('login cliente prioriza link de acesso e mantém cadastro cliente', async ({ page }) => {
  await page.goto('/login?audience=client&redirect=/(client)/appointments', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('login-description')).toContainText('agendar, acompanhar e gerenciar');
  await expect(page.getByTestId('login-password-input')).toHaveCount(0);
  await expect(page.getByTestId('login-submit-button')).toContainText('Enviar link de acesso');

  await page.getByTestId('login-register-link').click();
  await expect(page).toHaveURL(/\/register\?/);
  const registrationUrl = new URL(page.url());
  expect(registrationUrl.searchParams.get('intent')).toBe('client');
  expect(registrationUrl.searchParams.get('redirect')).toBe('/(client)/appointments');
});

test('login empresarial prioriza senha e orienta colaboradores', async ({ page }) => {
  await page.goto('/login?audience=business', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('login-title')).toHaveText('Acesse sua operação.');
  await expect(page.getByTestId('login-password-input')).toBeVisible();
  await expect(page.getByTestId('login-submit-button')).toContainText('Entrar na área de gestão');
  await expect(page.getByTestId('login-forgot-password-link')).toBeVisible();
  await expect(page.getByTestId('login-invite-note')).toContainText('convite recebido');
});

test('login sem audiência ou com audiência inválida usa contexto empresarial', async ({ page }) => {
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('login-password-input')).toBeVisible();

  await page.goto('/login?audience=invalid', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('login-title')).toHaveText('Acesse sua operação.');
  await expect(page.getByTestId('login-password-input')).toBeVisible();
});

test('cadastro de estabelecimento preserva onboarding ao voltar para o login', async ({ page }) => {
  await page.goto('/register?intent=establishment&redirect=/(client)/request-establishment', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('register-description')).toContainText('cadastro verificado do estabelecimento');
  await expect(page.getByTestId('register-security-notice')).toContainText('onboarding verificado');
  await expect(page.getByTestId('register-submit-button')).toContainText('Criar acesso e continuar');
  await expect(page.locator('body')).not.toContainText('Dono/Admin');

  await page.getByTestId('register-login-link').click();
  await expect(page).toHaveURL(/\/login\?/);
  const loginUrl = new URL(page.url());
  expect(loginUrl.searchParams.get('audience')).toBe('business');
  expect(loginUrl.searchParams.get('redirect')).toBe('/(client)/request-establishment');
});

test('redirect externo é descartado nas transições de autenticação', async ({ page }) => {
  await page.goto('/login?audience=client&redirect=https://example.com', { waitUntil: 'domcontentloaded' });
  await page.getByTestId('login-register-link').click();
  const registrationUrl = new URL(page.url());
  expect(registrationUrl.searchParams.get('intent')).toBe('client');
  expect(registrationUrl.searchParams.has('redirect')).toBe(false);

  await page.goto('/login?audience=client&redirect=%2F%2Fevil.example', { waitUntil: 'domcontentloaded' });
  await page.getByTestId('login-register-link').click();
  const protocolRelativeUrl = new URL(page.url());
  expect(protocolRelativeUrl.searchParams.has('redirect')).toBe(false);
});
