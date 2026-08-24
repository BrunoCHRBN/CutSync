import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeCurrencyCode } from '@cutsync/domain';

import type { BusinessRpcArgs, BusinessRpcName } from './business-rpc.generated';
import type { Database } from './supabase.generated';
import type { EstablishmentPaymentMethodType } from './manual-pos';

export type FinancialOperationsOverviewScope = 'unit' | 'own';
export type FinancialCashStatus = 'unavailable' | 'not_open' | 'open' | 'closed';
export type FinancialOverviewAlertSeverity = 'info' | 'warning';
export type FinancialOverviewAlertCode =
  | 'financial_ops_disabled'
  | 'payment_methods_not_configured'
  | 'cash_session_not_open'
  | 'orders_awaiting_payment'
  | 'cash_variance_detected';
export type FinancialOverviewAlertAction =
  | 'review_readiness'
  | 'configure_payment_methods'
  | 'open_cash'
  | 'review_orders'
  | 'review_cash';

export interface FinancialOperationsReadiness {
  ready: boolean;
  operationalReady: boolean;
  financialOpsEnabled: boolean;
  activePaymentMethodCount: number;
  activePaymentMethodTypes: EstablishmentPaymentMethodType[];
  cashMethodActive: boolean;
  cashSessionOpen: boolean;
  blockers: string[];
}

export interface FinancialOperationsPaymentOverview {
  canView: boolean;
  grossReceivedCents: number;
  voidedCents: number;
  netReceivedCents: number;
  cashReceivedCents: number;
  pixReceivedCents: number;
  cardReceivedCents: number;
  awaitingOrderCount: number;
  outstandingCents: number;
}

export interface FinancialOperationsCashOverview {
  canView: boolean;
  status: FinancialCashStatus;
  sessionId: string | null;
  openedAt: string | null;
  expectedCountCents: number | null;
  expectedCountVisibility: 'visible' | 'hidden';
  lastClosedVarianceCents: number | null;
}

export interface FinancialOverviewAlert {
  code: FinancialOverviewAlertCode;
  severity: FinancialOverviewAlertSeverity;
  title: string;
  message: string;
  action: FinancialOverviewAlertAction;
}

export interface FinancialOperationsOverview {
  establishmentId: string;
  localDate: string;
  timezone: string;
  currency: string;
  scope: FinancialOperationsOverviewScope;
  readiness: FinancialOperationsReadiness;
  payments: FinancialOperationsPaymentOverview;
  cash: FinancialOperationsCashOverview;
  alerts: FinancialOverviewAlert[];
  dataCutoffAt: string;
  correlationId: string;
}

export type FinancialOperationsApiErrorCode =
  | 'invalid_request'
  | 'invalid_response'
  | 'network_error'
  | 'unauthorized'
  | 'forbidden'
  | 'backend_unavailable'
  | 'financial_overview_unavailable';

export class FinancialOperationsApiError extends Error {
  readonly code: FinancialOperationsApiErrorCode;

  constructor(code: FinancialOperationsApiErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'FinancialOperationsApiError';
    this.code = code;
  }
}

type UnknownRecord = Record<string, unknown>;
type RpcResult = { data: unknown; error: unknown };
type RpcCaller = <Name extends BusinessRpcName>(
  name: Name,
  args?: BusinessRpcArgs<Name>,
) => PromiseLike<RpcResult>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LOCAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const PAYMENT_METHOD_TYPES = new Set<EstablishmentPaymentMethodType>([
  'cash', 'external_pix', 'external_card',
]);
const CASH_STATUSES = new Set<FinancialCashStatus>([
  'unavailable', 'not_open', 'open', 'closed',
]);
const ALERT_CODES = new Set<FinancialOverviewAlertCode>([
  'financial_ops_disabled', 'payment_methods_not_configured',
  'cash_session_not_open', 'orders_awaiting_payment', 'cash_variance_detected',
]);
const ALERT_ACTIONS = new Set<FinancialOverviewAlertAction>([
  'review_readiness', 'configure_payment_methods', 'open_cash',
  'review_orders', 'review_cash',
]);

const isRecord = (value: unknown): value is UnknownRecord => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);
const isUuid = (value: unknown): value is string => (
  typeof value === 'string' && UUID_PATTERN.test(value)
);
const isIsoDate = (value: unknown): value is string => (
  typeof value === 'string' && Number.isFinite(Date.parse(value))
);
const isValidLocalDate = (value: unknown): value is string => {
  if (typeof value !== 'string' || !LOCAL_DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
};
const isSafeNonNegativeInteger = (value: unknown): value is number => (
  Number.isSafeInteger(value) && (value as number) >= 0
);
const isSafeSignedInteger = (value: unknown): value is number => Number.isSafeInteger(value);
const isNullableSafeSignedInteger = (value: unknown): value is number | null => (
  value === null || isSafeSignedInteger(value)
);
const isNullableUuid = (value: unknown): value is string | null => (
  value === null || isUuid(value)
);
const isNullableIsoDate = (value: unknown): value is string | null => (
  value === null || isIsoDate(value)
);
const isStringArray = (value: unknown): value is string[] => (
  Array.isArray(value) && value.every((item) => typeof item === 'string')
);

const mapReadiness = (value: unknown): FinancialOperationsReadiness | null => {
  if (!isRecord(value)
    || typeof value.ready !== 'boolean'
    || typeof value.operationalReady !== 'boolean'
    || typeof value.financialOpsEnabled !== 'boolean'
    || !isSafeNonNegativeInteger(value.activePaymentMethodCount)
    || !Array.isArray(value.activePaymentMethodTypes)
    || !value.activePaymentMethodTypes.every((method) => (
      typeof method === 'string'
      && PAYMENT_METHOD_TYPES.has(method as EstablishmentPaymentMethodType)
    ))
    || typeof value.cashMethodActive !== 'boolean'
    || typeof value.cashSessionOpen !== 'boolean'
    || !isStringArray(value.blockers)
  ) return null;
  return value as unknown as FinancialOperationsReadiness;
};

const mapPayments = (value: unknown): FinancialOperationsPaymentOverview | null => {
  if (!isRecord(value)
    || typeof value.canView !== 'boolean'
    || !isSafeNonNegativeInteger(value.grossReceivedCents)
    || !isSafeNonNegativeInteger(value.voidedCents)
    || !isSafeSignedInteger(value.netReceivedCents)
    || !isSafeSignedInteger(value.cashReceivedCents)
    || !isSafeSignedInteger(value.pixReceivedCents)
    || !isSafeSignedInteger(value.cardReceivedCents)
    || !isSafeNonNegativeInteger(value.awaitingOrderCount)
    || !isSafeNonNegativeInteger(value.outstandingCents)
    || (!value.canView && (
      value.grossReceivedCents !== 0
      || value.voidedCents !== 0
      || value.netReceivedCents !== 0
      || value.cashReceivedCents !== 0
      || value.pixReceivedCents !== 0
      || value.cardReceivedCents !== 0
      || value.awaitingOrderCount !== 0
      || value.outstandingCents !== 0
    ))
  ) return null;
  return value as unknown as FinancialOperationsPaymentOverview;
};

const mapCash = (value: unknown): FinancialOperationsCashOverview | null => {
  if (!isRecord(value)
    || typeof value.canView !== 'boolean'
    || typeof value.status !== 'string'
    || !CASH_STATUSES.has(value.status as FinancialCashStatus)
    || !isNullableUuid(value.sessionId)
    || !isNullableIsoDate(value.openedAt)
    || !isNullableSafeSignedInteger(value.expectedCountCents)
    || (value.expectedCountVisibility !== 'visible' && value.expectedCountVisibility !== 'hidden')
    || !isNullableSafeSignedInteger(value.lastClosedVarianceCents)
    || (value.expectedCountVisibility === 'hidden' && value.expectedCountCents !== null)
  ) return null;
  return value as unknown as FinancialOperationsCashOverview;
};

const mapAlert = (value: unknown): FinancialOverviewAlert | null => {
  if (!isRecord(value)
    || typeof value.code !== 'string'
    || !ALERT_CODES.has(value.code as FinancialOverviewAlertCode)
    || (value.severity !== 'info' && value.severity !== 'warning')
    || typeof value.title !== 'string'
    || value.title.trim().length === 0
    || typeof value.message !== 'string'
    || value.message.trim().length === 0
    || typeof value.action !== 'string'
    || !ALERT_ACTIONS.has(value.action as FinancialOverviewAlertAction)
  ) return null;
  return value as unknown as FinancialOverviewAlert;
};

export const mapFinancialOperationsOverview = (
  value: unknown,
): FinancialOperationsOverview | null => {
  if (!isRecord(value) || !Array.isArray(value.alerts)) return null;
  const readiness = mapReadiness(value.readiness);
  const payments = mapPayments(value.payments);
  const cash = mapCash(value.cash);
  const alerts = value.alerts.map(mapAlert);
  const currency = normalizeCurrencyCode(value.currency);
  if (!isUuid(value.establishmentId)
    || !isValidLocalDate(value.localDate)
    || typeof value.timezone !== 'string'
    || value.timezone.trim().length === 0
    || currency === null
    || (value.scope !== 'unit' && value.scope !== 'own')
    || !readiness
    || !payments
    || !cash
    || alerts.some((alert) => alert === null)
    || !isIsoDate(value.dataCutoffAt)
    || !isUuid(value.correlationId)
  ) return null;
  return {
    establishmentId: value.establishmentId,
    localDate: value.localDate,
    timezone: value.timezone.trim(),
    currency,
    scope: value.scope,
    readiness,
    payments,
    cash,
    alerts: alerts as FinancialOverviewAlert[],
    dataCutoffAt: value.dataCutoffAt,
    correlationId: value.correlationId,
  };
};

const remoteErrorText = (error: unknown): string => {
  if (!isRecord(error)) return String(error ?? '').toLowerCase();
  return ['code', 'message', 'details', 'hint']
    .map((key) => error[key])
    .filter((part): part is string => typeof part === 'string')
    .join(' ')
    .toLowerCase();
};

export const translateFinancialOperationsRpcError = (
  error: unknown,
): FinancialOperationsApiError => {
  const text = remoteErrorText(error);
  if (text.includes('network') || text.includes('fetch')) {
    return new FinancialOperationsApiError('network_error');
  }
  if (text.includes('pgrst301') || text.includes('jwt') || text.includes('authentication_required')) {
    return new FinancialOperationsApiError('unauthorized');
  }
  if (text.includes('42501') || text.includes('forbidden') || text.includes('permission denied')) {
    return new FinancialOperationsApiError('forbidden');
  }
  if (text.includes('pgrst202') || text.includes('could not find the function')) {
    return new FinancialOperationsApiError('backend_unavailable');
  }
  return new FinancialOperationsApiError('financial_overview_unavailable');
};

const invokeRpc = async <Name extends BusinessRpcName>(
  client: SupabaseClient<Database>,
  name: Name,
  args: BusinessRpcArgs<Name>,
): Promise<unknown> => {
  const caller = client.rpc.bind(client) as unknown as RpcCaller;
  let result: RpcResult;
  try {
    result = await caller(name, args);
  } catch (error) {
    throw translateFinancialOperationsRpcError(error);
  }
  if (result.error) throw translateFinancialOperationsRpcError(result.error);
  return result.data;
};

export const createFinancialOperationsApi = (client: SupabaseClient<Database>) => ({
  async getOverview(establishmentId: string, localDate: string) {
    if (!isUuid(establishmentId)
      || !isValidLocalDate(localDate)
    ) throw new FinancialOperationsApiError('invalid_request');
    const data = await invokeRpc(client, 'get_financial_operations_overview', {
      target_establishment_id: establishmentId,
      target_local_date: localDate,
    });
    const mapped = mapFinancialOperationsOverview(data);
    if (!mapped) throw new FinancialOperationsApiError('invalid_response');
    return mapped;
  },
});
