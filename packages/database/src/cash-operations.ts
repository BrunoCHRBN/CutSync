import type { SupabaseClient } from '@supabase/supabase-js';

import type { BusinessRpcArgs, BusinessRpcName } from './business-rpc.generated';
import type { Database } from './supabase.generated';

export type CashMovementType = 'cash_in' | 'cash_out' | 'sale_cash' | 'refund_cash';
export type CashSessionStatus = 'open' | 'closed';

export interface CashMovement {
  id: string;
  movementType: CashMovementType;
  amountCents: number;
  reason: string | null;
  sourcePaymentEntryId: string | null;
  correlationId: string;
  recordedBy: string;
  createdAt: string;
}

export interface CashSession {
  id: string;
  status: CashSessionStatus;
  openingFloatCents: number;
  expectedCountCents: number;
  declaredCountCents: number | null;
  varianceCents: number | null;
  openedBy: string;
  closedBy: string | null;
  reopenedFromSessionId: string | null;
  version: number;
  openedAt: string;
  closedAt: string | null;
}

export interface CashRegisterSnapshot {
  establishmentId: string;
  cashRegisterId: string;
  cashRegisterName: string;
  dataCutoffAt: string;
  correlationId: string;
  session: CashSession | null;
  movements: CashMovement[];
}

export interface CashCommandReceipt {
  cashSessionId: string;
  cashMovementId?: string;
  status: CashSessionStatus;
  version: number;
  expectedCountCents: number;
  declaredCountCents?: number;
  varianceCents?: number;
}

export type CashOperationsApiErrorCode =
  | 'invalid_request'
  | 'network_error'
  | 'unauthorized'
  | 'forbidden'
  | 'aal2_required'
  | 'backend_unavailable'
  | 'invalid_response'
  | 'financial_ops_disabled'
  | 'cash_register_unavailable'
  | 'cash_session_required'
  | 'cash_session_already_open'
  | 'cash_session_not_open'
  | 'cash_session_not_closed'
  | 'cash_session_not_latest'
  | 'cash_session_version_conflict'
  | 'cash_balance_negative'
  | 'cash_operations_unavailable';

export class CashOperationsApiError extends Error {
  readonly code: CashOperationsApiErrorCode;

  constructor(code: CashOperationsApiErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'CashOperationsApiError';
    this.code = code;
  }
}

type RpcResult = { data: unknown; error: unknown };
type RpcCaller = <Name extends BusinessRpcName>(
  name: Name,
  args?: BusinessRpcArgs<Name>,
) => PromiseLike<RpcResult>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MOVEMENT_TYPES = new Set<CashMovementType>(['cash_in', 'cash_out', 'sale_cash', 'refund_cash']);
const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);
const isUuid = (value: unknown): value is string => typeof value === 'string' && UUID_PATTERN.test(value);
const isIsoDate = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value));
const isMoney = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const isSignedMoney = (value: unknown): value is number => Number.isSafeInteger(value);
const nullableUuid = (value: unknown): value is string | null => value === null || isUuid(value);
const nullableString = (value: unknown): value is string | null => value === null || typeof value === 'string';
const nullableDate = (value: unknown): value is string | null => value === null || isIsoDate(value);

const mapMovement = (value: unknown): CashMovement | null => {
  if (!isRecord(value)) return null;
  const movementType = value.movementType;
  if (!isUuid(value.id) || typeof movementType !== 'string'
    || !MOVEMENT_TYPES.has(movementType as CashMovementType)
    || !isMoney(value.amountCents) || value.amountCents === 0
    || !nullableString(value.reason) || !nullableUuid(value.sourcePaymentEntryId)
    || !isUuid(value.correlationId) || !isUuid(value.recordedBy) || !isIsoDate(value.createdAt)
  ) return null;
  return {
    id: value.id,
    movementType: movementType as CashMovementType,
    amountCents: value.amountCents,
    reason: value.reason,
    sourcePaymentEntryId: value.sourcePaymentEntryId,
    correlationId: value.correlationId,
    recordedBy: value.recordedBy,
    createdAt: value.createdAt,
  };
};

const mapSession = (value: unknown): CashSession | null => {
  if (!isRecord(value) || (value.status !== 'open' && value.status !== 'closed')
    || !isUuid(value.id) || !isMoney(value.openingFloatCents) || !isMoney(value.expectedCountCents)
    || !(value.declaredCountCents === null || isMoney(value.declaredCountCents))
    || !(value.varianceCents === null || isSignedMoney(value.varianceCents))
    || !isUuid(value.openedBy) || !nullableUuid(value.closedBy)
    || !nullableUuid(value.reopenedFromSessionId) || !Number.isSafeInteger(value.version)
    || (value.version as number) < 1 || !isIsoDate(value.openedAt) || !nullableDate(value.closedAt)
  ) return null;
  return {
    id: value.id,
    status: value.status,
    openingFloatCents: value.openingFloatCents,
    expectedCountCents: value.expectedCountCents,
    declaredCountCents: value.declaredCountCents,
    varianceCents: value.varianceCents,
    openedBy: value.openedBy,
    closedBy: value.closedBy,
    reopenedFromSessionId: value.reopenedFromSessionId,
    version: value.version as number,
    openedAt: value.openedAt,
    closedAt: value.closedAt,
  };
};

export const mapCashRegisterSnapshot = (value: unknown): CashRegisterSnapshot | null => {
  if (!isRecord(value) || !Array.isArray(value.movements)
    || !isUuid(value.establishmentId) || !isUuid(value.cashRegisterId)
    || typeof value.cashRegisterName !== 'string' || !isIsoDate(value.dataCutoffAt)
    || !isUuid(value.correlationId)
  ) return null;
  const session = value.session === null ? null : mapSession(value.session);
  const movements = value.movements.map(mapMovement);
  if ((value.session !== null && session === null) || movements.some((movement) => movement === null)) return null;
  return {
    establishmentId: value.establishmentId,
    cashRegisterId: value.cashRegisterId,
    cashRegisterName: value.cashRegisterName,
    dataCutoffAt: value.dataCutoffAt,
    correlationId: value.correlationId,
    session,
    movements: movements as CashMovement[],
  };
};

export const mapCashCommandReceipt = (value: unknown): CashCommandReceipt | null => {
  if (!isRecord(value) || !isUuid(value.cashSessionId)
    || (value.status !== 'open' && value.status !== 'closed')
    || !Number.isSafeInteger(value.version) || (value.version as number) < 1
    || !isMoney(value.expectedCountCents)
    || !(value.cashMovementId === undefined || isUuid(value.cashMovementId))
    || !(value.declaredCountCents === undefined || isMoney(value.declaredCountCents))
    || !(value.varianceCents === undefined || isSignedMoney(value.varianceCents))
  ) return null;
  return {
    cashSessionId: value.cashSessionId,
    ...(value.cashMovementId === undefined ? {} : { cashMovementId: value.cashMovementId }),
    status: value.status,
    version: value.version as number,
    expectedCountCents: value.expectedCountCents,
    ...(value.declaredCountCents === undefined ? {} : { declaredCountCents: value.declaredCountCents }),
    ...(value.varianceCents === undefined ? {} : { varianceCents: value.varianceCents }),
  };
};

const remoteErrorText = (error: unknown): string => {
  if (!isRecord(error)) return '';
  return ['code', 'message', 'details', 'hint'].map((key) => error[key])
    .filter((part): part is string => typeof part === 'string').join(' ').toLowerCase();
};

export const translateCashOperationsRpcError = (error: unknown): CashOperationsApiError => {
  const text = remoteErrorText(error);
  const codes: CashOperationsApiErrorCode[] = [
    'financial_ops_disabled', 'aal2_required', 'cash_register_unavailable',
    'cash_session_required', 'cash_session_already_open', 'cash_session_not_open',
    'cash_session_not_closed', 'cash_session_not_latest', 'cash_session_version_conflict',
    'cash_balance_negative',
  ];
  const matched = codes.find((code) => text.includes(code));
  if (matched) return new CashOperationsApiError(matched);
  if (text.includes('authentication_required')) return new CashOperationsApiError('unauthorized');
  if (text.includes('invalid_cash_amount') || text.includes('invalid_cash_movement')) {
    return new CashOperationsApiError('invalid_request');
  }
  if (text.includes('cash_ledger_append_only')) return new CashOperationsApiError('forbidden');
  if (text.includes('network') || text.includes('fetch')) return new CashOperationsApiError('network_error');
  if (text.includes('pgrst301') || text.includes('jwt')) return new CashOperationsApiError('unauthorized');
  if (text.includes('42501') || text.includes('forbidden') || text.includes('permission denied')) {
    return new CashOperationsApiError('forbidden');
  }
  if (text.includes('pgrst202') || text.includes('could not find the function')) {
    return new CashOperationsApiError('backend_unavailable');
  }
  return new CashOperationsApiError('cash_operations_unavailable');
};

const requireUuid = (value: string): string => {
  if (!isUuid(value)) throw new CashOperationsApiError('invalid_request');
  return value;
};
const requireMoney = (value: number): number => {
  if (!isMoney(value)) throw new CashOperationsApiError('invalid_request');
  return value;
};
const requireVersion = (value: number): number => {
  if (!Number.isSafeInteger(value) || value < 1) throw new CashOperationsApiError('invalid_request');
  return value;
};
const invokeRpc = async <Name extends BusinessRpcName>(client: SupabaseClient<Database>, name: Name, args: BusinessRpcArgs<Name>) => {
  const caller = client.rpc.bind(client) as unknown as RpcCaller;
  let result: RpcResult;
  try { result = await caller(name, args); } catch (error) { throw translateCashOperationsRpcError(error); }
  if (result.error) throw translateCashOperationsRpcError(result.error);
  return result.data;
};

export const createCashOperationsApi = (client: SupabaseClient<Database>) => ({
  async getSnapshot(establishmentId: string) {
    const data = await invokeRpc(client, 'get_cash_register_snapshot', {
      target_establishment_id: requireUuid(establishmentId),
    });
    const mapped = mapCashRegisterSnapshot(data);
    if (!mapped) throw new CashOperationsApiError('invalid_response');
    return mapped;
  },
  async openSession(input: { establishmentId: string; openingFloatCents: number; requestId: string }) {
    const data = await invokeRpc(client, 'open_cash_session', {
      target_establishment_id: requireUuid(input.establishmentId),
      target_opening_float_cents: requireMoney(input.openingFloatCents),
      target_request_id: requireUuid(input.requestId),
    });
    const mapped = mapCashCommandReceipt(data);
    if (!mapped) throw new CashOperationsApiError('invalid_response');
    return mapped;
  },
  async recordMovement(input: { establishmentId: string; cashSessionId: string; movementType: 'cash_in' | 'cash_out'; amountCents: number; reason: string; expectedVersion: number; requestId: string }) {
    const reason = input.reason.trim();
    if (input.amountCents <= 0 || reason.length < 3 || reason.length > 500) {
      throw new CashOperationsApiError('invalid_request');
    }
    const data = await invokeRpc(client, 'record_cash_movement', {
      target_establishment_id: requireUuid(input.establishmentId),
      target_cash_session_id: requireUuid(input.cashSessionId),
      target_movement_type: input.movementType,
      target_amount_cents: requireMoney(input.amountCents),
      target_reason: reason,
      target_expected_version: requireVersion(input.expectedVersion),
      target_request_id: requireUuid(input.requestId),
    });
    const mapped = mapCashCommandReceipt(data);
    if (!mapped) throw new CashOperationsApiError('invalid_response');
    return mapped;
  },
  async closeSession(input: { establishmentId: string; cashSessionId: string; declaredCountCents: number; expectedVersion: number; requestId: string }) {
    const data = await invokeRpc(client, 'close_cash_session', {
      target_establishment_id: requireUuid(input.establishmentId),
      target_cash_session_id: requireUuid(input.cashSessionId),
      target_declared_count_cents: requireMoney(input.declaredCountCents),
      target_expected_version: requireVersion(input.expectedVersion),
      target_request_id: requireUuid(input.requestId),
    });
    const mapped = mapCashCommandReceipt(data);
    if (!mapped) throw new CashOperationsApiError('invalid_response');
    return mapped;
  },
  async reopenSession(input: { establishmentId: string; closedCashSessionId: string; expectedVersion: number; requestId: string }) {
    const data = await invokeRpc(client, 'reopen_cash_session', {
      target_establishment_id: requireUuid(input.establishmentId),
      target_closed_cash_session_id: requireUuid(input.closedCashSessionId),
      target_expected_version: requireVersion(input.expectedVersion),
      target_request_id: requireUuid(input.requestId),
    });
    const mapped = mapCashCommandReceipt(data);
    if (!mapped) throw new CashOperationsApiError('invalid_response');
    return mapped;
  },
});
