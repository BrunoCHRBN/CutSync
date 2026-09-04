import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const {
  CONTROL_SUPABASE_PROJECTS,
  ControlEnvironmentValidationError,
  validateControlEnvironment,
  verifySupabasePublicKey,
  // The production preflight is intentionally a CommonJS Node entrypoint.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
} = require('../../scripts/validate-control-environment.cjs');

const root = process.cwd();
const readJson = (relativePath: string) => JSON.parse(
  fs.readFileSync(path.join(root, relativePath), 'utf8'),
);

const environmentInput = (
  environment: 'homolog' | 'production',
) => ({
  controlEnvironment: environment,
  supabaseUrl: `https://${CONTROL_SUPABASE_PROJECTS[environment]}.supabase.co`,
  publishableKey: 'sb_publishable_contract_test_value',
});

test('aceita aliases Control somente quando apontam para o Supabase esperado', () => {
  for (const alias of [
    'local',
    'development',
    'dev',
    'preview',
    'homologation',
    'homolog',
    'staging',
  ]) {
    expect(validateControlEnvironment({
      ...environmentInput('homolog'),
      controlEnvironment: alias,
    })).toEqual({
      environment: 'homolog',
      projectRef: CONTROL_SUPABASE_PROJECTS.homolog,
      keyType: 'publishable',
    });
  }

  for (const alias of ['production', 'prod']) {
    expect(validateControlEnvironment({
      ...environmentInput('production'),
      controlEnvironment: alias,
    })).toEqual({
      environment: 'production',
      projectRef: CONTROL_SUPABASE_PROJECTS.production,
      keyType: 'publishable',
    });
  }
});

test('aceita o fallback público compartilhado quando ele representa o mesmo ambiente', () => {
  expect(validateControlEnvironment({
    ...environmentInput('homolog'),
    controlEnvironment: undefined,
    appEnvironment: 'preview',
  })).toMatchObject({
    environment: 'homolog',
    projectRef: CONTROL_SUPABASE_PROJECTS.homolog,
  });

  expect(validateControlEnvironment({
    ...environmentInput('homolog'),
    controlEnvironment: 'homolog',
    appEnvironment: 'preview',
  })).toMatchObject({ environment: 'homolog' });
});

test('bloqueia rótulo ausente, desconhecido, conflitante ou cruzado com outro projeto', () => {
  const invalidInputs = [
    {
      ...environmentInput('homolog'),
      controlEnvironment: undefined,
    },
    {
      ...environmentInput('homolog'),
      controlEnvironment: 'qa-desconhecido',
    },
    {
      ...environmentInput('homolog'),
      controlEnvironment: 'homolog',
      appEnvironment: 'production',
    },
    {
      ...environmentInput('production'),
      controlEnvironment: 'homolog',
    },
  ];

  for (const input of invalidInputs) {
    expect(() => validateControlEnvironment(input))
      .toThrow(ControlEnvironmentValidationError);
  }
});

test('rejeita URL e chave pública inválidas sem expor a chave no erro', () => {
  const publishableKey = 'sb_secret_forbidden_value';
  const invalidInputs = [
    {
      ...environmentInput('homolog'),
      supabaseUrl: undefined,
    },
    {
      ...environmentInput('homolog'),
      supabaseUrl: 'http://invalid.test',
    },
    {
      ...environmentInput('homolog'),
      publishableKey,
    },
  ];

  for (const input of invalidInputs) {
    let failure: unknown;
    try {
      validateControlEnvironment(input);
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(ControlEnvironmentValidationError);
    expect(String(failure)).not.toContain(publishableKey);
  }
});

test('confirma a publishable key no Auth sem ler ou registrar o corpo', async () => {
  const input = environmentInput('homolog');
  const acceptedRequests: { url: string; apikey: string | undefined }[] = [];

  await verifySupabasePublicKey({
    ...input,
    fetchImpl: async (url: URL, init: { headers?: { apikey?: string } }) => {
      acceptedRequests.push({
        url: url.toString(),
        apikey: init.headers?.apikey,
      });
      return { ok: true };
    },
  });

  expect(acceptedRequests).toEqual([{
    url: `https://${CONTROL_SUPABASE_PROJECTS.homolog}.supabase.co/auth/v1/settings`,
    apikey: input.publishableKey,
  }]);

  await expect(verifySupabasePublicKey({
    ...input,
    fetchImpl: async () => ({ ok: false }),
  })).rejects.toMatchObject({ code: 'CONTROL_ENV_PUBLIC_KEY_REJECTED' });
});

test('o export web do Control sempre executa a barreira antes do Expo', () => {
  const controlPackage = readJson('apps/control/package.json');
  const vercelConfig = readJson('apps/control/vercel.json');

  expect(controlPackage.scripts['env:validate'])
    .toBe('node --env-file-if-exists=.env ../../scripts/validate-control-environment.cjs');
  expect(controlPackage.scripts['build:web'])
    .toBe('npm run env:validate && expo export --platform web');
  expect(vercelConfig.buildCommand).toBe('npm run build:web');
});
