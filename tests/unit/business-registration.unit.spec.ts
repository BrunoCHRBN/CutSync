import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import {
  formatBrazilPhone,
  formatMaskedDocument,
  isValidCnpj,
  isValidCpf,
  normalizeCnpj,
  normalizeBrazilPhoneE164,
} from '../../packages/validation/src/business-registration';

test('validates CPF and CNPJ check digits', () => {
    expect(isValidCpf('529.982.247-25')).toBe(true);
    expect(isValidCpf('111.111.111-11')).toBe(false);
    expect(isValidCnpj('04.252.011/0001-10')).toBe(true);
    expect(isValidCnpj('11.111.111/1111-11')).toBe(false);
    expect(isValidCnpj('12.ABC.345/01DE-35')).toBe(true);
    expect(isValidCnpj('12.ABC.345/01DE-34')).toBe(false);
    expect(normalizeCnpj('12.abc.345/01de-35')).toBe('12ABC34501DE35');
});

test('normalizes Brazilian phones without making them unique', () => {
    expect(normalizeBrazilPhoneE164('(16) 99999-0000')).toBe('+5516999990000');
    expect(normalizeBrazilPhoneE164('+55 (11) 3333-4444')).toBe('+551133334444');
    expect(normalizeBrazilPhoneE164('11111111111')).toBeNull();
    expect(formatBrazilPhone('+5516999990000')).toBe('+55 (16) 99999-0000');
});

test('exposes only masked documents', () => {
    expect(formatMaskedDocument('CPF', '4725')).toBe('***.***.***-4725');
    expect(formatMaskedDocument('CNPJ', '0110')).toBe('**.***.***/****-0110');
});

test('routes business registration through the private AAL2 endpoint', () => {
  const root = process.cwd();
  const onboarding = fs.readFileSync(
    path.join(root, 'apps/web/src/components/screens/RequestEstablishmentExperience.tsx'),
    'utf8',
  );
  const migration = fs.readFileSync(
    path.join(root, 'supabase/migrations/20260727000000_private_legal_identity_and_aal2.sql'),
    'utf8',
  );
  expect(onboarding).toContain("functions.invoke('submit-business-registration'");
  expect(onboarding).not.toContain("rpc('create_establishment_cpf'");
  expect(onboarding).not.toContain("eq('document_number'");
  expect(onboarding).not.toContain('123456');
  expect(migration).toContain('document_fingerprint text NOT NULL UNIQUE');
  expect(migration).toContain(
    "target_document_type = 'CPF' AND target_document_last4 !~ '^[0-9]{4}$'",
  );
  expect(migration).toContain(
    "target_document_type = 'CNPJ' AND target_document_last4 !~ '^[A-Z0-9]{4}$'",
  );
  expect(migration).toContain('ALTER TABLE public.organization_billing_accounts');
  expect(migration).toContain("to_regclass('public.billing_accounts') IS NOT NULL");
  expect(migration).toContain("RAISE EXCEPTION 'aal2_required'");
  expect(migration).toContain('identity_migration_conflicts');
});
