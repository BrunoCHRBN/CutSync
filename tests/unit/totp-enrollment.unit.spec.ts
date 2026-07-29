import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

import {
  getTotpEnrollmentErrorMessage,
  getTotpFactorState,
} from '../../packages/domain/src/totp-enrollment';

test('separates verified and abandoned TOTP enrollments without touching other factors', () => {
  expect(getTotpFactorState([
    {
      id: 'totp-pending',
      factor_type: 'totp',
      friendly_name: 'CutSync Control',
      status: 'unverified',
    },
    {
      id: 'other-totp-pending',
      factor_type: 'totp',
      friendly_name: 'Another app',
      status: 'unverified',
    },
    { id: 'phone-pending', factor_type: 'phone', status: 'unverified' },
    { id: 'totp-ready', factor_type: 'totp', status: 'verified' },
  ], 'CutSync Control')).toEqual({
    verifiedFactorId: 'totp-ready',
    unverifiedFactorIds: ['totp-pending'],
  });
});

test('explains known enrollment failures without exposing internal error details', () => {
  expect(getTotpEnrollmentErrorMessage({ code: 'mfa_factor_name_conflict' })).toContain(
    'cadastro incompleto',
  );
  expect(getTotpEnrollmentErrorMessage({ code: 'mfa_totp_enroll_not_enabled' })).toContain(
    'desativado',
  );
  expect(getTotpEnrollmentErrorMessage({ message: 'internal server details' })).toBe(
    'Não foi possível cadastrar o autenticador.',
  );
});

test('establishment TOTP setup generates QR automatically when no factor is verified', () => {
  const setup = fs.readFileSync(
    path.join(process.cwd(), 'apps/web/src/components/security/TotpSecuritySetup.tsx'),
    'utf8',
  );

  expect(setup).toContain('await enrollWithFactorState(getTotpFactorState(data?.all, \'CutSync\'))');
  expect(setup).toContain('qrCode: normalizeTotpQrCode(result.data.totp.qr_code)');
  expect(setup).toContain('Esta conta já possui um autenticador TOTP cadastrado');
});
