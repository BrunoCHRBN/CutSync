import { expect, test, type Page } from '@playwright/test';

import {
  CLIENT_ONBOARDING_STORAGE_KEY,
  CLIENT_ONBOARDING_VERSION,
} from '../src/features/onboarding/client-onboarding-state';

const credentials = {
  email: process.env.CUTSYNC_E2E_CLIENT_EMAIL,
  password: process.env.CUTSYNC_E2E_CLIENT_PASSWORD,
};
const allowMutations = process.env.CUTSYNC_E2E_SUPPORT_MUTATIONS === '1';

const signIn = async (page: Page) => {
  test.skip(
    !credentials.email || !credentials.password,
    'Configure CUTSYNC_E2E_CLIENT_EMAIL e CUTSYNC_E2E_CLIENT_PASSWORD.',
  );
  await page.addInitScript(({ onboardingKey, onboardingVersion }) => {
    window.localStorage.setItem(onboardingKey, String(onboardingVersion));
  }, {
    onboardingKey: CLIENT_ONBOARDING_STORAGE_KEY,
    onboardingVersion: CLIENT_ONBOARDING_VERSION,
  });
  await page.goto('/sign-in');
  await page.evaluate(() => {
    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith('cutsync.client.support-draft.')) {
        window.localStorage.removeItem(key);
      }
    }
  });
  await page.getByTestId('client-sign-in-email').fill(credentials.email as string);
  await page.getByTestId('client-sign-in-password').fill(credentials.password as string);
  await page.getByTestId('client-sign-in-submit').click();
  await expect(page.getByTestId('client-app-shell')).toBeVisible({ timeout: 20_000 });
};

const openWizard = async (page: Page) => {
  await page.goto('/support/new');
  await expect(page.getByTestId('client-support-new-screen')).toBeVisible({
    timeout: 20_000,
  });
};

const continuePastOptionalContext = async (page: Page) => {
  const noAppointment = page.getByTestId('client-support-appointment-');
  if (await noAppointment.count()) {
    await noAppointment.click();
    await page.getByTestId('client-support-continue').click();
  }
};

const reachDetails = async ({
  page,
  category = 'other',
  impact = 'normal',
}: {
  page: Page;
  category?: string;
  impact?: 'normal' | 'high' | 'critical';
}) => {
  await page.getByTestId(`client-support-category-${category}`).click();
  await page.getByTestId('client-support-continue').click();
  await continuePastOptionalContext(page);
  await page.getByTestId(`client-support-impact-${impact}`).click();
  await page.getByTestId('client-support-continue').click();
};

test('revisa um incidente sem criar ticket antes da confirmação', async ({ page }) => {
  await signIn(page);
  await openWizard(page);
  await reachDetails({ page });

  await page.getByTestId('client-support-answer-attempted').fill(
    'Concluir uma ação no aplicativo',
  );
  await page.getByTestId('client-support-answer-observed').fill(
    'A tela apresentou um erro e não permitiu continuar',
  );
  await page.getByTestId('client-support-answer-expected').fill(
    'A ação deveria ter sido concluída normalmente',
  );
  await expect(page.getByTestId('client-support-subject')).not.toHaveValue('');
  await page.getByTestId('client-support-continue').click();

  await expect(page.getByText('Outros', { exact: true })).toBeVisible();
  await expect(page.getByTestId('client-support-create')).toBeVisible();
  await expect(page.getByTestId('client-support-detail-screen')).toHaveCount(0);

  if (allowMutations) {
    await page.getByTestId('client-support-create').click();
    await expect(page.getByTestId('client-support-detail-screen')).toBeVisible({
      timeout: 30_000,
    });
  }
});

test('revisa incidente crítico com as três perguntas guiadas', async ({ page }) => {
  await signIn(page);
  await openWizard(page);
  await reachDetails({
    page,
    category: 'access_identity',
    impact: 'critical',
  });

  await page.getByTestId('client-support-answer-attempted').fill(
    'Entrar no aplicativo para consultar um atendimento',
  );
  await page.getByTestId('client-support-answer-observed').fill(
    'O aplicativo encerrou e não permite continuar',
  );
  await page.getByTestId('client-support-answer-expected').fill(
    'A conta deveria abrir normalmente',
  );
  await page.getByTestId('client-support-continue').click();

  await expect(page.getByText('Acesso e identidade', { exact: true })).toBeVisible();
  await expect(page.getByText('Crítico', { exact: true })).toBeVisible();
  await expect(page.getByTestId('client-support-create')).toBeVisible();
});

test('preserva e restaura o rascunho ao fechar o assistente', async ({ page }) => {
  await signIn(page);
  await openWizard(page);
  await reachDetails({ page, category: 'booking' });
  await page.getByTestId('client-support-answer-attempted').fill(
    'Reagendar um atendimento',
  );

  await page.getByRole('button', { name: 'Fechar' }).click();
  await page.goto('/support/new');
  await expect(page.getByTestId('client-support-draft-offer')).toBeVisible();
  await page.getByTestId('client-support-draft-continue').click();
  await expect(page.getByTestId('client-support-answer-attempted')).toHaveValue(
    'Reagendar um atendimento',
  );

  await page.getByRole('button', { name: 'Fechar' }).click();
  await page.goto('/support/new');
  await page.getByTestId('client-support-draft-discard').click();
  await expect(page.getByTestId('client-support-category-booking')).toBeVisible();
});
