import { expect, test } from '@playwright/test';
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
