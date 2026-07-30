import { expect, test } from '@playwright/test';

const SECTION_TESTIDS = {
  client: [
    'landing-client-proposal',
    'landing-client-ecosystem',
    'landing-client-services',
    'landing-client-devices',
    'landing-client-transparency',
    'landing-client-security',
    'landing-client-journey',
    'landing-client-resources',
    'landing-client-faq',
    'landing-client-contact',
    'landing-client-future',
    'landing-client-footer',
  ],
  business: [
    'landing-business-proposal',
    'landing-business-ecosystem',
    'landing-business-services',
    'landing-business-devices',
    'landing-business-transparency',
    'landing-business-security',
    'landing-business-how-to-start',
    'landing-business-resources',
    'landing-business-faq',
    'landing-business-contact',
    'landing-business-future',
    'landing-business-footer',
  ],
} as const;

const ROUTES = [
  ['client', '/'],
  ['business', '/para-estabelecimentos'],
] as const;

for (const [audience, route] of ROUTES) {
  test(`landing ${audience} — sequência editorial completa e sem prova social inventada`, async ({ page }) => {
    await page.goto(route, { waitUntil: 'domcontentloaded' });
    for (const testId of SECTION_TESTIDS[audience]) {
      await expect(page.getByTestId(testId)).toHaveCount(1);
    }
    await expect(page.getByTestId(`landing-${audience}-testimonials`)).toHaveCount(0);
    await expect(page.getByTestId(`landing-${audience}-available-today`)).toBeAttached();
    await expect(page.getByTestId(`landing-${audience}-in-validation`)).toContainText('Status operacional ao vivo');
    await expect(page.locator('body')).not.toContainText(/R\$\s*\d+\s*\/\s*m[êe]s|plano premium|ISO 27001|em breve/i);
  });

  test(`landing ${audience} — navegação por seções e recursos internos`, async ({ page }) => {
    await page.goto(route, { waitUntil: 'domcontentloaded' });
    const isDesktop = (page.viewportSize()?.width ?? 0) >= 1040;
    test.skip(!isDesktop, 'A navegação do header é exibida somente no desktop.');

    await page.getByTestId('landing-nav-contact').click();
    await expect(page.getByTestId(`landing-${audience}-contact-form`)).toBeInViewport();

    await page.getByTestId('landing-nav-security').click();
    await expect(page.getByTestId(`landing-${audience}-security`)).toBeInViewport();

    await page.getByTestId('landing-nav-resources').click();
    await page.getByTestId(`landing-${audience}-resource-faq`).click();
    await expect(page.getByTestId(`landing-${audience}-faq`)).toBeInViewport();
  });

  test(`landing ${audience} — FAQ expande e recolhe pelo teclado`, async ({ page }) => {
    await page.goto(route, { waitUntil: 'domcontentloaded' });
    const question = page.getByTestId(`landing-${audience}-faq-question-1`);
    await question.scrollIntoViewIfNeeded();
    await question.focus();
    await expect(question).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId(`landing-${audience}-faq-answer-1`)).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId(`landing-${audience}-faq-answer-1`)).toHaveCount(0);
  });

  test(`landing ${audience} — formulário valida antes de enviar`, async ({ page }) => {
    await page.goto(route, { waitUntil: 'domcontentloaded' });
    const form = page.getByTestId(`landing-${audience}-contact-form`);
    await form.scrollIntoViewIfNeeded();

    await page.getByTestId('landing-contact-submit').click();
    await expect(page.getByTestId('landing-contact-field-error')).toContainText('nome');

    await page.getByTestId('landing-contact-name').fill('Ana Souza');
    await page.getByTestId('landing-contact-submit').click();
    await expect(page.getByTestId('landing-contact-field-error')).toContainText('e-mail');

    await page.getByTestId('landing-contact-email').fill('ana@exemplo.com');
    await page.getByTestId('landing-contact-submit').click();
    await expect(page.getByTestId('landing-contact-field-error')).toContainText('12 caracteres');

    await page.getByTestId('landing-contact-message').fill('Mensagem sintética de validação da landing.');
    await page.getByTestId('landing-contact-submit').click();
    await expect(page.getByTestId('landing-contact-field-error')).toContainText('consentimento');

    await expect(page.getByTestId('landing-contact-honeypot')).not.toBeInViewport();
  });

  test(`landing ${audience} — confirmação genérica quando a RPC aceita`, async ({ page }) => {
    await page.route('**/rest/v1/rpc/submit_marketing_contact_request', async (routeRequest) => {
      await routeRequest.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'received' }) });
    });
    await page.goto(route, { waitUntil: 'domcontentloaded' });
    await page.getByTestId(`landing-${audience}-contact-form`).scrollIntoViewIfNeeded();
    await page.getByTestId('landing-contact-name').fill('Ana Souza');
    await page.getByTestId('landing-contact-email').fill('ana@exemplo.com');
    if (audience === 'business') await page.getByTestId('landing-contact-establishment').fill('Studio Central');
    await page.getByTestId('landing-contact-message').fill('Mensagem sintética de validação da landing.');
    await page.getByTestId('landing-contact-consent').click();
    await page.getByTestId('landing-contact-submit').click();
    await expect(page.getByTestId('landing-contact-success')).toContainText('Recebemos sua solicitação');
    await expect(page.getByTestId('landing-contact-name')).toHaveValue('');
  });

  test(`landing ${audience} — erro de rede mantém mensagem genérica`, async ({ page }) => {
    await page.route('**/rest/v1/rpc/submit_marketing_contact_request', (routeRequest) => routeRequest.abort());
    await page.goto(route, { waitUntil: 'domcontentloaded' });
    await page.getByTestId(`landing-${audience}-contact-form`).scrollIntoViewIfNeeded();
    await page.getByTestId('landing-contact-name').fill('Ana Souza');
    await page.getByTestId('landing-contact-email').fill('ana@exemplo.com');
    await page.getByTestId('landing-contact-message').fill('Mensagem sintética de validação da landing.');
    await page.getByTestId('landing-contact-consent').click();
    await page.getByTestId('landing-contact-submit').click();
    await expect(page.getByTestId('landing-contact-error')).toContainText('Não foi possível enviar agora');
  });

  test(`landing ${audience} — sem overflow horizontal e prévias de dispositivos visíveis`, async ({ page }) => {
    await page.goto(route, { waitUntil: 'networkidle' });
    for (const device of ['phone', 'tablet', 'desktop']) {
      await expect(page.getByTestId(`landing-${audience}-device-${device}`)).toHaveCount(1);
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
}

test('landing cliente — movimento reduzido mantém navegação e contato utilizáveis', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const isDesktop = (page.viewportSize()?.width ?? 0) >= 1040;
  if (isDesktop) {
    await page.getByTestId('landing-nav-contact').click();
    await expect(page.getByTestId('landing-client-contact-form')).toBeInViewport();
  } else {
    await page.getByTestId('landing-client-contact-form').scrollIntoViewIfNeeded();
  }
  await expect(page.getByTestId('landing-contact-submit')).toBeVisible();
});

test('rodapé expandido leva aos documentos públicos', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByTestId('landing-client-footer-privacy-link').click();
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page.getByTestId('public-privacy-page')).toContainText('Solicitações comerciais');

  await page.goto('/para-estabelecimentos', { waitUntil: 'domcontentloaded' });
  await page.getByTestId('landing-business-footer-account-deletion-link').click();
  await expect(page).toHaveURL(/\/account-deletion$/);
});
