import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import * as ts from 'typescript';

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
  openRequest: '88888888-8888-4888-8888-888888888888',
  closeRequest: '99999999-9999-4999-8999-999999999999',
  reopenRequest: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
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

const findDirectCashTableCalls = (source: string, fileName: string): string[] => {
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const tables: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && node.arguments.length > 0) {
      const expression = node.expression;
      const isFromCall = (
        ts.isPropertyAccessExpression(expression) && expression.name.text === 'from'
      ) || (
        ts.isElementAccessExpression(expression)
        && ts.isStringLiteralLike(expression.argumentExpression)
        && expression.argumentExpression.text === 'from'
      );
      const table = node.arguments[0];
      if (isFromCall && ts.isStringLiteralLike(table) && table.text.startsWith('cash_')) {
        tables.push(table.text);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return tables;
};

test('maps cash snapshot and rejects unsafe money or unknown movement types', () => {
  expect(mapCashRegisterSnapshot(snapshot)).toEqual(snapshot);
  expect(mapCashRegisterSnapshot({ ...snapshot, session: { ...snapshot.session, expectedCountCents: Number.MAX_SAFE_INTEGER + 1 } })).toBeNull();
  expect(mapCashRegisterSnapshot({ ...snapshot, movements: [{ ...snapshot.movements[0], movementType: 'billing_charge' }] })).toBeNull();
});

test('cash-table syntax guard detects quote, whitespace and element-access variants', () => {
  const source = `
    client.from ("cash_registers");
    client['from'](\`cash_movements\`);
    client.from('appointments');
  `;
  expect(findDirectCashTableCalls(source, 'guard-fixture.ts')).toEqual(['cash_registers', 'cash_movements']);
});

test('cash API binds exact snapshot and versioned command RPC contracts', async () => {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const api = createCashOperationsApi({
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      if (name === 'get_cash_register_snapshot') return { data: snapshot, error: null };
      if (name === 'record_cash_movement') {
        return { data: { cashSessionId: ids.session, cashMovementId: ids.movement, status: 'open', version: 3, expectedCountCents: 13000 }, error: null };
      }
      if (name === 'close_cash_session') {
        return { data: { cashSessionId: ids.session, status: 'closed', version: 4, expectedCountCents: 13000, declaredCountCents: 12900, varianceCents: -100 }, error: null };
      }
      return { data: { cashSessionId: ids.session, status: 'open', version: 1, expectedCountCents: 10000 }, error: null };
    },
  } as never);

  await api.getSnapshot(ids.establishment);
  await api.openSession({ establishmentId: ids.establishment, openingFloatCents: 10000, requestId: ids.openRequest });
  await api.recordMovement({ establishmentId: ids.establishment, cashSessionId: ids.session,
    movementType: 'cash_in', amountCents: 500, reason: 'Troco extra', expectedVersion: 2, requestId: ids.request });
  await api.closeSession({ establishmentId: ids.establishment, cashSessionId: ids.session,
    declaredCountCents: 12900, expectedVersion: 3, requestId: ids.closeRequest });
  await api.reopenSession({ establishmentId: ids.establishment, closedCashSessionId: ids.session,
    expectedVersion: 4, requestId: ids.reopenRequest });

  expect(calls).toEqual([
    { name: 'get_cash_register_snapshot', args: { target_establishment_id: ids.establishment } },
    { name: 'open_cash_session', args: { target_establishment_id: ids.establishment,
      target_opening_float_cents: 10000, target_request_id: ids.openRequest } },
    { name: 'record_cash_movement', args: { target_establishment_id: ids.establishment,
      target_cash_session_id: ids.session, target_movement_type: 'cash_in', target_amount_cents: 500,
      target_reason: 'Troco extra', target_expected_version: 2, target_request_id: ids.request } },
    { name: 'close_cash_session', args: { target_establishment_id: ids.establishment,
      target_cash_session_id: ids.session, target_declared_count_cents: 12900,
      target_expected_version: 3, target_request_id: ids.closeRequest } },
    { name: 'reopen_cash_session', args: { target_establishment_id: ids.establishment,
      target_closed_cash_session_id: ids.session, target_expected_version: 4,
      target_request_id: ids.reopenRequest } },
  ]);
});

test('cash API preserves the idempotency payload when the caller retries a network failure', async () => {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const api = createCashOperationsApi({
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      if (calls.length === 1) throw new Error('network request failed');
      return { data: { cashSessionId: ids.session, cashMovementId: ids.movement,
        status: 'open', version: 3, expectedCountCents: 13000 }, error: null };
    },
  } as never);
  const command = { establishmentId: ids.establishment, cashSessionId: ids.session,
    movementType: 'cash_in' as const, amountCents: 500, reason: 'Troco extra',
    expectedVersion: 2, requestId: ids.request };

  await expect(api.recordMovement(command)).rejects.toMatchObject({ code: 'network_error' });
  await expect(api.recordMovement(command)).resolves.toMatchObject({ cashMovementId: ids.movement });
  expect(calls).toHaveLength(2);
  expect(calls[0]).toEqual(calls[1]);
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

test('Business and Web cash surfaces retain UI guards without direct cash-table calls', () => {
  const business = readFileSync('apps/business/src/screens/cash.tsx', 'utf8');
  const businessApi = readFileSync('apps/business/src/services/business-api.ts', 'utf8');
  const web = readFileSync('apps/web/src/components/settings/CashOperationsSettings.tsx', 'utf8');
  expect(findDirectCashTableCalls(business, 'cash.tsx')).toEqual([]);
  expect(findDirectCashTableCalls(web, 'CashOperationsSettings.tsx')).toEqual([]);
  expect(businessApi).toContain("aal2_required: 'Confirme sua autenticação em duas etapas para continuar.'");
  expect(web).toContain('const epoch = ++loadEpoch.current');
  expect(web).toContain('epoch === loadEpoch.current');
  expect(web).toContain('label="Tentar novamente"');
});
