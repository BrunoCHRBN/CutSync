import { expect, test } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import {
  getSupabasePublishableKey,
  getSupabaseSecretKey,
} from '../../supabase/functions/_shared/supabase-keys';

const root = process.cwd();
const environmentReader = (values: Record<string, string>) => (
  name: string,
) => values[name];

test('seleciona chaves publishable e secret pelo nome no mapa hospedado', () => {
  const readEnvironment = environmentReader({
    SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({
      default: 'sb_publishable_default-test',
      web: 'sb_publishable_web-test',
    }),
    SUPABASE_SECRET_KEYS: JSON.stringify({
      default: 'sb_secret_default-test',
      billing: 'sb_secret_billing-test',
    }),
  });

  expect(getSupabasePublishableKey('web', readEnvironment))
    .toBe('sb_publishable_web-test');
  expect(getSupabaseSecretKey('billing', readEnvironment))
    .toBe('sb_secret_billing-test');
});

test('aceita somente fallbacks singulares novos no desenvolvimento local', () => {
  const readEnvironment = environmentReader({
    SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_local-test',
    SUPABASE_SECRET_KEY: 'sb_secret_local-test',
    SUPABASE_ANON_KEY: 'legacy-anon-must-be-ignored',
    SUPABASE_SERVICE_ROLE_KEY: 'legacy-service-must-be-ignored',
  });

  expect(getSupabasePublishableKey('default', readEnvironment))
    .toBe('sb_publishable_local-test');
  expect(getSupabaseSecretKey('default', readEnvironment))
    .toBe('sb_secret_local-test');
});

test('rejeita JSON, nome, prefixo e chave ausente sem revelar valores', () => {
  const invalidEnvironments = [
    environmentReader({ SUPABASE_SECRET_KEYS: '{invalid' }),
    environmentReader({
      SUPABASE_SECRET_KEYS: JSON.stringify({ default: 'legacy-value' }),
    }),
    environmentReader({
      SUPABASE_SECRET_KEYS: JSON.stringify({ other: 'sb_secret_other-test' }),
    }),
    environmentReader({}),
  ];

  for (const readEnvironment of invalidEnvironments) {
    let failure: unknown;
    try {
      getSupabaseSecretKey('default', readEnvironment);
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(Error);
    expect(String(failure)).not.toContain('legacy-value');
    expect(String(failure)).not.toContain('sb_secret_other-test');
  }

  expect(() => getSupabaseSecretKey('../default', environmentReader({
    SUPABASE_SECRET_KEYS: JSON.stringify({
      default: 'sb_secret_default-test',
    }),
  }))).toThrow('invalid_supabase_secret_key_name');
});

test('Edge Functions não dependem de nomes legados nem enviam secret como Bearer', () => {
  const functionsRoot = path.join(root, 'supabase/functions');
  const sources = fs.readdirSync(functionsRoot, {
    recursive: true,
    withFileTypes: true,
  })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
    .map((entry) => fs.readFileSync(path.join(entry.parentPath, entry.name), 'utf8'))
    .join('\n');
  const fiscalReconciliation = fs.readFileSync(
    path.join(functionsRoot, 'reconcile-fiscal-documents/index.ts'),
    'utf8',
  );

  expect(sources).toContain('SUPABASE_SECRET_KEYS');
  expect(sources).toContain('SUPABASE_PUBLISHABLE_KEYS');
  expect(sources).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
  expect(sources).not.toContain('SUPABASE_ANON_KEY');
  expect(fiscalReconciliation).toContain('apikey: getSupabaseSecretKey()');
  expect(fiscalReconciliation).not.toContain('Authorization:');
});

test('cutover remoto mantém projeto restrito, saída sanitizada e rollback explícito', () => {
  const manager = fs.readFileSync(
    path.join(root, 'scripts/manage-supabase-legacy-api-keys.ps1'),
    'utf8',
  );
  const publicSmoke = fs.readFileSync(
    path.join(root, 'scripts/smoke-supabase-public-access.cjs'),
    'utf8',
  );

  expect(manager).toContain('SupportsShouldProcess = $true');
  expect(manager).toContain("'sphbbqdgcreowxzjgibj'");
  expect(manager).toContain("'hxoenfnszrrgaqxplzmd'");
  expect(manager).toContain("[ValidateSet('Status', 'Disable', 'Enable')]");
  expect(manager).toContain('$PSCmdlet.ShouldProcess');
  expect(manager).toMatch(/'Disable'\s*\{\s*\$false\s*\}/);
  expect(manager).toMatch(/'Enable'\s*\{\s*\$true\s*\}/);
  expect(manager).toContain('/api-keys/legacy');
  expect(manager).toContain('[Net.Http.HttpMethod]::Get');
  expect(manager).toContain('[Net.Http.HttpMethod]::Put');
  expect(manager).toContain('LegacyEnabled = [bool]$state.enabled');
  expect(manager).not.toMatch(/Write-(Host|Output|Verbose).*accessToken/i);

  expect(publicSmoke).toContain('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
  expect(publicSmoke).not.toContain('EXPO_PUBLIC_SUPABASE_ANON_KEY');
  expect(publicSmoke).toContain('/auth/v1/settings');
  expect(publicSmoke).toContain('/rest/v1/establishments?select=id&limit=1');
  expect(publicSmoke).toContain('/functions/v1/submit-business-registration');
  expect(publicSmoke).toContain('PUBLIC_SMOKE_EDGE_SKIP_NOT_ALLOWED');
  expect(publicSmoke).toContain("functionError !== 'authentication_required'");
});

test('smoke não permite ignorar Edge Functions em Homolog', () => {
  const script = path.join(root, 'scripts/smoke-supabase-public-access.cjs');
  const publishableKey = 'sb_publishable_unit-test-value';
  const result = spawnSync(
    process.execPath,
    [script, 'sphbbqdgcreowxzjgibj', '--skip-edge'],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        EXPO_PUBLIC_SUPABASE_URL:
          'https://sphbbqdgcreowxzjgibj.supabase.co',
        EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey,
      },
    },
  );

  expect(result.status).toBe(1);
  expect(result.stderr).toContain('PUBLIC_SMOKE_EDGE_SKIP_NOT_ALLOWED');
  expect(result.stderr).not.toContain(publishableKey);
});
