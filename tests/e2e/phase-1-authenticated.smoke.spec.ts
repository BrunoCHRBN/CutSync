import { expect, Page, test } from '@playwright/test';

const accounts = {
  professional: {
    email: process.env.CUTSYNC_E2E_PROFESSIONAL_EMAIL,
    password: process.env.CUTSYNC_E2E_PROFESSIONAL_PASSWORD,
  },
  client: {
    email: process.env.CUTSYNC_E2E_CLIENT_EMAIL,
    password: process.env.CUTSYNC_E2E_CLIENT_PASSWORD,
  },
};

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.getByTestId('login-email-input').fill(email);
  await page.getByTestId('login-password-input').fill(password);
  await page.getByTestId('login-submit-button').click();
  await expect(page.getByTestId('login-screen')).toBeHidden({ timeout: 20_000 });
}

async function expectAvailabilityResult(page: Page, loadingId: string, errorId: string, resultIds: string[]) {
  await expect(page.getByTestId(loadingId)).toBeHidden({ timeout: 20_000 });
  await expect(page.getByTestId(errorId)).toBeHidden();

  await expect
    .poll(async () => {
      for (const testId of resultIds) {
        if (await page.getByTestId(testId).isVisible()) return testId;
      }
      return null;
    }, { timeout: 20_000 })
    .not.toBeNull();
}

test.describe('Fase 1 — disponibilidade autenticada', () => {
  test.describe('Business', () => {
    test.skip(
      !accounts.professional.email || !accounts.professional.password,
      'Configure as variáveis CUTSYNC_E2E_PROFESSIONAL_*',
    );

    test('profissional consulta horários do encaixe rápido sem gravar dados', async ({ page }) => {
      await signIn(page, accounts.professional.email!, accounts.professional.password!);
      await page.goto('/professional');
      await expect(page.getByTestId('barber-dashboard-screen')).toBeVisible({ timeout: 20_000 });
      await expect(page.getByTestId('barber-agenda-loading')).toBeHidden({ timeout: 20_000 });

      await page.getByTestId('barber-quick-booking-button').click();
      await expect(page.getByTestId('barber-quick-booking-modal')).toBeVisible();

      await expectAvailabilityResult(
        page,
        'barber-quick-availability-loading',
        'barber-quick-availability-error',
        ['barber-quick-time-grid', 'barber-quick-availability-empty'],
      );
    });
  });

  test.describe('Client', () => {
    const slug = process.env.CUTSYNC_E2E_PUBLIC_SLUG;

    test.skip(
      !accounts.client.email || !accounts.client.password || !slug,
      'Configure CUTSYNC_E2E_CLIENT_* e CUTSYNC_E2E_PUBLIC_SLUG',
    );

    test('cliente consulta horários do agendamento sem confirmar reserva', async ({ page }) => {
      await signIn(page, accounts.client.email!, accounts.client.password!);
      await page.goto(`/${slug}/booking`);
      await expect(page.getByTestId('booking-screen')).toBeVisible({ timeout: 20_000 });

      await page.getByTestId(/^booking-service-/).first().click();
      await page.getByTestId(/^booking-professional-/).first().click();

      const selectableDate = page.locator(
        '[data-testid^="booking-date-"]:not([aria-disabled="true"])',
      ).first();
      await expect(selectableDate, 'deve existir uma data futura selecionável no mês atual').toBeVisible();
      await selectableDate.click();
      await expect(page.getByTestId('booking-time-slots-box')).toBeVisible();

      await expectAvailabilityResult(
        page,
        'booking-availability-loading',
        'booking-availability-error',
        ['booking-time-slots', 'booking-availability-empty'],
      );
    });
  });
});
