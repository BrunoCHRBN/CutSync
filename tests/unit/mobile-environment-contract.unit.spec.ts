import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const {
  MOBILE_EAS_PROJECTS,
  MOBILE_ENVIRONMENTS,
  MOBILE_SUPABASE_PROJECTS,
  MobileEnvironmentValidationError,
  validateMobileEnvironment,
  verifySupabasePublicKey,
} = require('../../scripts/validate-mobile-environment.cjs');

const root = process.cwd();
const readSource = (relativePath: string) => fs.readFileSync(
  path.join(root, relativePath),
  'utf8',
);
const readJson = (relativePath: string) => JSON.parse(readSource(relativePath));

const environmentInput = (
  app: 'client' | 'business',
  environment: 'development' | 'preview' | 'production',
) => ({
  app,
  environment,
  supabaseUrl: `https://${MOBILE_SUPABASE_PROJECTS[environment]}.supabase.co`,
  publishableKey: 'sb_publishable_contract_test_value',
  appEnvironment: environment,
  easProjectId: MOBILE_EAS_PROJECTS[app],
});

test('Client e Business declaram a mesma matriz lógica nos perfis EAS', () => {
  for (const app of ['client', 'business'] as const) {
    const eas = readJson(`apps/${app}/eas.json`);
    expect(Object.keys(eas.build).sort()).toEqual([...MOBILE_ENVIRONMENTS].sort());

    for (const environment of MOBILE_ENVIRONMENTS) {
      expect(eas.build[environment].environment).toBe(environment);
    }
  }
});

test('mantém projetos EAS próprios e um Supabase compartilhado por ambiente', () => {
  expect(MOBILE_EAS_PROJECTS.client).not.toBe(MOBILE_EAS_PROJECTS.business);
  expect(MOBILE_SUPABASE_PROJECTS.development).toBe(MOBILE_SUPABASE_PROJECTS.preview);
  expect(MOBILE_SUPABASE_PROJECTS.production).not.toBe(MOBILE_SUPABASE_PROJECTS.preview);

  for (const app of ['client', 'business'] as const) {
    const appJson = readJson(`apps/${app}/app.json`);
    expect(appJson.expo.extra.eas.projectId).toBe(MOBILE_EAS_PROJECTS[app]);

    for (const environment of MOBILE_ENVIRONMENTS) {
      expect(validateMobileEnvironment(environmentInput(app, environment))).toMatchObject({
        app,
        environment,
        projectRef: MOBILE_SUPABASE_PROJECTS[environment],
        easProjectId: MOBILE_EAS_PROJECTS[app],
        keyType: 'publishable',
      });
    }
  }
});

test('rejeita URL, chave, rótulo e projeto cruzados sem revelar credenciais', () => {
  const invalidInputs = [
    { ...environmentInput('business', 'preview'), supabaseUrl: undefined },
    { ...environmentInput('business', 'preview'), supabaseUrl: 'http://invalid.test' },
    { ...environmentInput('business', 'preview'), publishableKey: undefined },
    { ...environmentInput('business', 'preview'), publishableKey: 'sb_secret_forbidden' },
    { ...environmentInput('business', 'preview'), appEnvironment: undefined },
    {
      ...environmentInput('business', 'preview'),
      supabaseUrl: `https://${MOBILE_SUPABASE_PROJECTS.production}.supabase.co`,
    },
    { ...environmentInput('business', 'preview'), appEnvironment: 'production' },
    {
      ...environmentInput('business', 'preview'),
      easProjectId: MOBILE_EAS_PROJECTS.client,
    },
  ];

  for (const input of invalidInputs) {
    let failure: unknown;
    try {
      validateMobileEnvironment(input);
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(MobileEnvironmentValidationError);
    expect(String(failure)).not.toContain(String(input.publishableKey));
  }
});

test('exige vínculo real entre a URL e a chave pública sem expor a chave', async () => {
  const input = environmentInput('business', 'preview');
  const acceptedRequests: string[] = [];

  await verifySupabasePublicKey({
    ...input,
    fetchImpl: async (url: URL) => {
      acceptedRequests.push(url.toString());
      return { ok: true };
    },
  });

  expect(acceptedRequests).toEqual([
    `https://${MOBILE_SUPABASE_PROJECTS.preview}.supabase.co/auth/v1/settings`,
  ]);

  let failure: unknown;
  try {
    await verifySupabasePublicKey({
      ...input,
      fetchImpl: async () => ({ ok: false }),
    });
  } catch (error) {
    failure = error;
  }

  expect(failure).toMatchObject({ code: 'MOBILE_ENV_PUBLIC_KEY_REJECTED' });
  expect(String(failure)).not.toContain(input.publishableKey);
});

test('rejeita chave anon legada mesmo quando o JWT tem o project ref correto', () => {
  expect(() => validateMobileEnvironment({
    ...environmentInput('business', 'preview'),
    publishableKey: [
      'header',
      Buffer.from(JSON.stringify({
        role: 'anon',
        ref: MOBILE_SUPABASE_PROJECTS.preview,
      })).toString('base64url'),
      'signature',
    ].join('.'),
  })).toThrow(MobileEnvironmentValidationError);
});

test('todos os clientes públicos exigem publishable key sem fallback legado', () => {
  const sources = [
    'apps/client/src/lib/supabase.ts',
    'apps/business/src/lib/supabase.ts',
    'apps/web/src/services/supabase.ts',
    'apps/web/src/services/supabaseGovernance.ts',
    'apps/control/src/services/supabase.ts',
    'scripts/validate-mobile-environment.cjs',
  ].map(readSource).join('\n');

  expect(sources).toContain('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
  expect(sources).not.toContain('EXPO_PUBLIC_SUPABASE_ANON_KEY');
});

test('scripts de build validam o ambiente remoto antes de iniciar o EAS Build', () => {
  for (const app of ['client', 'business'] as const) {
    const packageJson = readJson(`apps/${app}/package.json`);
    for (const environment of MOBILE_ENVIRONMENTS) {
      expect(packageJson.scripts[`env:validate:${environment}`])
        .toContain(`validate-mobile-environment.cjs --app ${app} --environment ${environment}`);
      expect(packageJson.scripts[`eas:${environment}`])
        .toMatch(
          new RegExp(
            `^npm run env:validate:${environment} && npx eas-cli@21\\.4\\.0 build`,
          ),
        );
    }
  }
});
