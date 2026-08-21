import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

import {
  CashOperationsApiError,
  createCashOperationsApi,
  mapCashCommandReceipt,
  mapCashRegisterSnapshot,
  translateCashOperationsRpcError,
} from '../../packages/database/src/cash-operations';

const ids = {
  establishment: '11111111-1111-4111-8111-111111111111',
  register: '22222222-2222-4222-8222-222222222222',
  session: '33333333-3333-4333-8333-333333333333',
  movement: '44444444-4444-4444-8444-444444444444',
  actor: '55555555-5555-4555-8555-555555555555',
  correlation: '66666666-6666-4666-8666-666666666666',
  request: '77777777-7777-4777-8777-777777777777',
};

const snapshot = {
  establishmentId: ids.establishment,
  cashRegisterId: ids.register,
  cashRegisterName: 'Caixa principal',
  dataCutoffAt: '2026-08-20T12:00:00.000Z',
  correlationId: ids.correlation,
  session: {
    id: ids.session,
    status: 'open',
    openingFloatCents: 10000,
    expectedCountCents: 12500,
    declaredCountCents: null,
    varianceCents: null,
    openedBy: ids.actor,
    closedBy: null,
    reopenedFromSessionId: null,
    version: 2,
    openedAt: '2026-08-20T10:00:00.000Z',
    closedAt: null,
  },
  movements: [{
    id: ids.movement,
    movementType: 'cash_in',
    amountCents: 2500,
    reason: 'Fundo adicional',
    sourcePaymentEntryId: null,
    correlationId: ids.correlation,
    recordedBy: ids.actor,
    createdAt: '2026-08-20T11:00:00.000Z',
  }],
};

test('maps cash snapshot and rejects unsafe money or unknown movement types', () => {
  expect(mapCashRegisterSnapshot(snapshot)).toEqual(snapshot);
  expect(mapCashRegisterSnapshot({ ...snapshot, session: { ...snapshot.session, expectedCountCents: Number.MAX_SAFE_INTEGER + 1 } })).toBeNull();
  expect(mapCashRegisterSnapshot({ ...snapshot, movements: [{ ...snapshot.movements[0], movementType: 'billing_charge' }] })).toBeNull();
});

test('cash API binds versioned idempotent movement arguments', async () => {
  let calledName = '';
  let calledArgs: Record<string, unknown> = {};
  const api = createCashOperationsApi({
    rpc: async (name: string, args: Record<string, unknown>) => {
      calledName = name; calledArgs = args;
      return { data: { cashSessionId: ids.session, cashMovementId: ids.movement, status: 'open', version: 3, expectedCountCents: 13000 }, error: null };
    },
  } as never);
  const result = await api.recordMovement({ establishmentId: ids.establishment, cashSessionId: ids.session,
    movementType: 'cash_in', amountCents: 500, reason: 'Troco extra', expectedVersion: 2, requestId: ids.request });
  expect(calledName).toBe('record_cash_movement');
  expect(calledArgs).toEqual({ target_establishment_id: ids.establishment, target_cash_session_id: ids.session,
    target_movement_type: 'cash_in', target_amount_cents: 500, target_reason: 'Troco extra',
    target_expected_version: 2, target_request_id: ids.request });
  expect(result.expectedCountCents).toBe(13000);
});

test('cash API rejects decimal cents before invoking backend', async () => {
  const api = createCashOperationsApi({ rpc: async () => { throw new Error('must not run'); } } as never);
  await expect(api.openSession({ establishmentId: ids.establishment, openingFloatCents: 10.5, requestId: ids.request }))
    .rejects.toMatchObject({ code: 'invalid_request' });
});

test('cash API rejects movement reasons outside the server 3..500 boundary', async () => {
  const api = createCashOperationsApi({ rpc: async () => { throw new Error('must not run'); } } as never);
  const base = { establishmentId: ids.establishment, cashSessionId: ids.session,
    movementType: 'cash_in' as const, amountCents: 500, expectedVersion: 2, requestId: ids.request };
  await expect(api.recordMovement({ ...base, reason: 'x'.repeat(501) }))
    .rejects.toMatchObject({ code: 'invalid_request' });
  await expect(api.recordMovement({ ...base, reason: '  x  ' }))
    .rejects.toMatchObject({ code: 'invalid_request' });
});

test('maps signed variance and translates cash conflicts', () => {
  expect(mapCashCommandReceipt({ cashSessionId: ids.session, status: 'closed', version: 3,
    expectedCountCents: 12000, declaredCountCents: 11900, varianceCents: -100 }))
    .toMatchObject({ varianceCents: -100 });
  expect(translateCashOperationsRpcError({ code: 'P0001', message: 'cash_session_version_conflict' }))
    .toMatchObject({ code: 'cash_session_version_conflict' });
  expect(translateCashOperationsRpcError({ code: 'P0001', message: 'authentication_required' }))
    .toMatchObject({ code: 'unauthorized' });
  expect(translateCashOperationsRpcError({ code: 'P0001', message: 'invalid_cash_amount' }))
    .toMatchObject({ code: 'invalid_request' });
  expect(translateCashOperationsRpcError({ code: 'P0001', message: 'invalid_cash_movement' }))
    .toMatchObject({ code: 'invalid_request' });
  expect(translateCashOperationsRpcError({ code: '55000', message: 'cash_ledger_append_only' }))
    .toMatchObject({ code: 'forbidden' });
  expect(new CashOperationsApiError('cash_session_required').message).toBe('cash_session_required');
});

test('cash migration preserves RLS, append-only ledger and POS integration boundaries', () => {
  const migration = readFileSync('supabase/migrations/20260825000000_phase5_cash_operations.sql', 'utf8');
  expect(migration).toContain('CREATE TABLE public.cash_registers');
  expect(migration).toContain('CREATE UNIQUE INDEX cash_sessions_one_open_per_register_idx');
  expect(migration).toContain('REFERENCES public.establishments(id) ON DELETE CASCADE');
  expect(migration).toContain('REFERENCES public.cash_registers(id, establishment_id) ON DELETE RESTRICT');
  expect(migration).toContain('record_cash_movement_for_payment');
  expect(migration).toContain("NEW.method_type_snapshot <> 'cash'");
  expect(migration).toContain('cash_ledger_append_only');
  expect(migration).toContain('ALTER TABLE public.cash_movements ENABLE ROW LEVEL SECURITY');
  expect(migration).toContain('FROM PUBLIC, anon, authenticated');
  expect(migration).not.toContain('public.billing_');
  expect(migration).not.toContain('commission_entries');
});

test('Business and Web cash surfaces use RPC contracts instead of direct table access', () => {
  const business = readFileSync('apps/business/src/screens/cash.tsx', 'utf8');
  const businessApi = readFileSync('apps/business/src/services/business-api.ts', 'utf8');
  const web = readFileSync('apps/web/src/components/settings/CashOperationsSettings.tsx', 'utf8');
  for (const source of [business, web]) {
    expect(source).not.toContain(".from('cash_");
    expect(source).toContain('expectedVersion');
    expect(source).toContain('requestId');
  }
  expect(businessApi).toContain("aal2_required: 'Confirme sua autenticação em duas etapas para continuar.'");
  expect(web).toContain('const epoch = ++loadEpoch.current');
  expect(web).toContain('epoch === loadEpoch.current');
  expect(web).toContain('label="Tentar novamente"');
});
