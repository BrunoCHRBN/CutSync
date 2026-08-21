import type { SupabaseClient } from '@supabase/supabase-js';

import type { BusinessRpcArgs, BusinessRpcName } from './business-rpc.generated';
import type { Database } from './supabase.generated';

export type EstablishmentPaymentMethodType =
  | 'cash'
  | 'external_pix'
  | 'external_card';

export type ServiceOrderPaymentStatus =
  | 'unpaid'
  | 'partially_paid'
  | 'paid'
  | 'partially_refunded'
  | 'refunded';

export type OrderPaymentEntryStatus =
  | 'pending'
  | 'processing'
  | 'succeeded'
  | 'failed'
  | 'voided'
  | 'disputed';

export type OrderPaymentEntryType = 'payment' | 'void';

export interface EstablishmentPaymentMethod {
  id: string;
  methodType: EstablishmentPaymentMethodType;
  displayName: string;
  active: boolean;
  requiresReference: boolean;
  version: number;
}

export interface EstablishmentPaymentMethodsReadModel {
  establishmentId: string;
  dataCutoffAt: string;
  correlationId: string;
  methods: EstablishmentPaymentMethod[];
}

export interface OrderPaymentEntry {
  id: string;
  entryType: OrderPaymentEntryType;
  status: OrderPaymentEntryStatus;
  amountCents: number;
  currency: 'BRL';
  paymentMethodId: string;
  methodType: EstablishmentPaymentMethodType;
  methodName: string;
  originalPaymentEntryId: string | null;
  externalReference: string | null;
  reason: string | null;
  correlationId: string;
  createdAt: string;
}

export interface ServiceOrderPaymentSummary {
  serviceOrderId: string;
  establishmentId: string;
  orderStatus: 'open' | 'in_service' | 'awaiting_payment' | 'closed' | 'voided';
  paymentStatus: ServiceOrderPaymentStatus;
  currency: 'BRL';
  totalCents: number;
  paidCents: number;
  balanceCents: number;
  version: number;
  lastEntryAt: string | null;
  dataCutoffAt: string;
  correlationId: string;
  entries: OrderPaymentEntry[];
}

export interface PaymentMethodCommandReceipt {
  paymentMethodId: string;
  version: number;
}

export interface OrderPaymentCommandReceipt {
  serviceOrderId: string;
  paymentEntryId: string;
  status: 'awaiting_payment';
  version: number;
  paymentStatus: ServiceOrderPaymentStatus;
  paidCents: number;
  balanceCents: number;
}

export type ManualPosApiErrorCode =
  | 'invalid_request'
  | 'network_error'
  | 'unauthorized'
  | 'forbidden'
  | 'aal2_required'
  | 'backend_unavailable'
  | 'invalid_response'
  | 'financial_ops_disabled'
  | 'payment_method_unavailable'
  | 'payment_method_version_conflict'
  | 'payment_reference_required'
  | 'payment_exceeds_order_balance'
  | 'payment_entry_not_voidable'
  | 'payment_entry_already_voided'
  | 'service_order_version_conflict'
  | 'service_order_invalid_transition'
  | 'service_order_balance_unresolved'
  | 'cash_session_required'
  | 'cash_balance_negative'
  | 'manual_pos_unavailable';

export class ManualPosApiError extends Error {
  readonly code: ManualPosApiErrorCode;

  constructor(code: ManualPosApiErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'ManualPosApiError';
    this.code = code;
  }
}

type RpcResult = { data: unknown; error: unknown };
type RpcCaller = <Name extends BusinessRpcName>(
  name: Name,
  args?: BusinessRpcArgs<Name>,
) => PromiseLike<RpcResult>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAYMENT_METHOD_TYPES = new Set<EstablishmentPaymentMethodType>([
  'cash', 'external_pix', 'external_card',
]);
const PAYMENT_STATUSES = new Set<ServiceOrderPaymentStatus>([
  'unpaid', 'partially_paid', 'paid', 'partially_refunded', 'refunded',
]);
const ENTRY_STATUSES = new Set<OrderPaymentEntryStatus>([
  'pending', 'processing', 'succeeded', 'failed', 'voided', 'disputed',
]);
const ORDER_STATUSES = new Set<ServiceOrderPaymentSummary['orderStatus']>([
  'open', 'in_service', 'awaiting_payment', 'closed', 'voided',
]);

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);
const isUuid = (value: unknown): value is string => (
  typeof value === 'string' && UUID_PATTERN.test(value)
);
const isIsoDate = (value: unknown): value is string => (
  typeof value === 'string' && Number.isFinite(Date.parse(value))
);
const isSafeNonNegativeInteger = (value: unknown): value is number => (
  Number.isSafeInteger(value) && (value as number) >= 0
);
const nullableString = (value: unknown): value is string | null => (
  value === null || typeof value === 'string'
);

const mapPaymentMethod = (value: unknown): EstablishmentPaymentMethod | null => {
  if (!isRecord(value)) return null;
  const methodType = value.methodType;
  if (!isUuid(value.id)
    || typeof methodType !== 'string'
    || !PAYMENT_METHOD_TYPES.has(methodType as EstablishmentPaymentMethodType)
    || typeof value.displayName !== 'string'
    || typeof value.active !== 'boolean'
    || typeof value.requiresReference !== 'boolean'
    || !Number.isSafeInteger(value.version)
    || (value.version as number) < 1
  ) return null;
  return {
    id: value.id,
    methodType: methodType as EstablishmentPaymentMethodType,
    displayName: value.displayName,
    active: value.active,
    requiresReference: value.requiresReference,
    version: value.version as number,
  };
};

const mapPaymentEntry = (value: unknown): OrderPaymentEntry | null => {
  if (!isRecord(value)) return null;
  const methodType = value.methodType;
  const entryType = value.entryType;
  const status = value.status;
  if (!isUuid(value.id)
    || (entryType !== 'payment' && entryType !== 'void')
    || typeof status !== 'string'
    || !ENTRY_STATUSES.has(status as OrderPaymentEntryStatus)
    || !isSafeNonNegativeInteger(value.amountCents)
    || value.currency !== 'BRL'
    || !isUuid(value.paymentMethodId)
    || typeof methodType !== 'string'
    || !PAYMENT_METHOD_TYPES.has(methodType as EstablishmentPaymentMethodType)
    || typeof value.methodName !== 'string'
    || !(value.originalPaymentEntryId === null || isUuid(value.originalPaymentEntryId))
    || !nullableString(value.externalReference)
    || !nullableString(value.reason)
    || !isUuid(value.correlationId)
    || !isIsoDate(value.createdAt)
  ) return null;
  return {
    id: value.id,
    entryType,
    status: status as OrderPaymentEntryStatus,
    amountCents: value.amountCents as number,
    currency: 'BRL',
    paymentMethodId: value.paymentMethodId,
    methodType: methodType as EstablishmentPaymentMethodType,
    methodName: value.methodName,
    originalPaymentEntryId: value.originalPaymentEntryId as string | null,
    externalReference: value.externalReference,
    reason: value.reason,
    correlationId: value.correlationId,
    createdAt: value.createdAt,
  };
};

export const mapPaymentMethodsReadModel = (
  value: unknown,
): EstablishmentPaymentMethodsReadModel | null => {
  if (!isRecord(value) || !Array.isArray(value.methods)
    || !isUuid(value.establishmentId)
    || !isIsoDate(value.dataCutoffAt)
    || !isUuid(value.correlationId)
  ) return null;
  const methods = value.methods.map(mapPaymentMethod);
  if (methods.some((method) => method === null)) return null;
  return {
    establishmentId: value.establishmentId,
    dataCutoffAt: value.dataCutoffAt,
    correlationId: value.correlationId,
    methods: methods as EstablishmentPaymentMethod[],
  };
};

export const mapServiceOrderPaymentSummary = (
  value: unknown,
): ServiceOrderPaymentSummary | null => {
  if (!isRecord(value) || !Array.isArray(value.entries)) return null;
  const orderStatus = value.orderStatus;
  const paymentStatus = value.paymentStatus;
  const entries = value.entries.map(mapPaymentEntry);
  if (!isUuid(value.serviceOrderId)
    || !isUuid(value.establishmentId)
    || typeof orderStatus !== 'string'
    || !ORDER_STATUSES.has(orderStatus as ServiceOrderPaymentSummary['orderStatus'])
    || typeof paymentStatus !== 'string'
    || !PAYMENT_STATUSES.has(paymentStatus as ServiceOrderPaymentStatus)
    || value.currency !== 'BRL'
    || !isSafeNonNegativeInteger(value.totalCents)
    || !isSafeNonNegativeInteger(value.paidCents)
    || !isSafeNonNegativeInteger(value.balanceCents)
    || !Number.isSafeInteger(value.version)
    || (value.version as number) < 1
    || !(value.lastEntryAt === null || isIsoDate(value.lastEntryAt))
    || !isIsoDate(value.dataCutoffAt)
    || !isUuid(value.correlationId)
    || entries.some((entry) => entry === null)
  ) return null;
  return {
    serviceOrderId: value.serviceOrderId,
    establishmentId: value.establishmentId,
    orderStatus: orderStatus as ServiceOrderPaymentSummary['orderStatus'],
    paymentStatus: paymentStatus as ServiceOrderPaymentStatus,
    currency: 'BRL',
    totalCents: value.totalCents as number,
    paidCents: value.paidCents as number,
    balanceCents: value.balanceCents as number,
    version: value.version as number,
    lastEntryAt: value.lastEntryAt as string | null,
    dataCutoffAt: value.dataCutoffAt,
    correlationId: value.correlationId,
    entries: entries as OrderPaymentEntry[],
  };
};

const mapMethodReceipt = (value: unknown): PaymentMethodCommandReceipt | null => {
  if (!isRecord(value) || !isUuid(value.paymentMethodId)
    || !Number.isSafeInteger(value.version) || (value.version as number) < 1
  ) return null;
  return { paymentMethodId: value.paymentMethodId, version: value.version as number };
};

const mapPaymentReceipt = (value: unknown): OrderPaymentCommandReceipt | null => {
  if (!isRecord(value)) return null;
  const paymentStatus = value.paymentStatus;
  if (!isUuid(value.serviceOrderId) || !isUuid(value.paymentEntryId)
    || value.status !== 'awaiting_payment'
    || !Number.isSafeInteger(value.version) || (value.version as number) < 1
    || typeof paymentStatus !== 'string'
    || !PAYMENT_STATUSES.has(paymentStatus as ServiceOrderPaymentStatus)
    || !isSafeNonNegativeInteger(value.paidCents)
    || !isSafeNonNegativeInteger(value.balanceCents)
  ) return null;
  return {
    serviceOrderId: value.serviceOrderId,
    paymentEntryId: value.paymentEntryId,
    status: 'awaiting_payment',
    version: value.version as number,
    paymentStatus: paymentStatus as ServiceOrderPaymentStatus,
    paidCents: value.paidCents as number,
    balanceCents: value.balanceCents as number,
  };
};

const remoteErrorText = (error: unknown): string => {
  if (!isRecord(error)) return '';
  return ['code', 'message', 'details', 'hint']
    .map((key) => error[key])
    .filter((part): part is string => typeof part === 'string')
    .join(' ')
    .toLowerCase();
};

export const translateManualPosRpcError = (error: unknown): ManualPosApiError => {
  const text = remoteErrorText(error);
  const codes: ManualPosApiErrorCode[] = [
    'financial_ops_disabled', 'aal2_required', 'payment_method_unavailable',
    'payment_method_version_conflict', 'payment_reference_required',
    'payment_exceeds_order_balance', 'payment_entry_not_voidable',
    'payment_entry_already_voided', 'service_order_version_conflict',
    'service_order_invalid_transition', 'service_order_balance_unresolved',
    'cash_session_required', 'cash_balance_negative',
  ];
  const matched = codes.find((code) => text.includes(code));
  if (matched) return new ManualPosApiError(matched);
  if (text.includes('network') || text.includes('fetch')) return new ManualPosApiError('network_error');
  if (text.includes('pgrst301') || text.includes('jwt')) return new ManualPosApiError('unauthorized');
  if (text.includes('42501') || text.includes('forbidden') || text.includes('permission denied')) {
    return new ManualPosApiError('forbidden');
  }
  if (text.includes('pgrst202') || text.includes('could not find the function')) {
    return new ManualPosApiError('backend_unavailable');
  }
  return new ManualPosApiError('manual_pos_unavailable');
};

const requireUuid = (value: string, field: string): string => {
  if (!isUuid(value)) throw new ManualPosApiError('invalid_request', `invalid_${field}`);
  return value;
};
const requireVersion = (value: number): number => {
  if (!Number.isSafeInteger(value) || value < 1) throw new ManualPosApiError('invalid_request');
  return value;
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
    throw translateManualPosRpcError(error);
  }
  if (result.error) throw translateManualPosRpcError(result.error);
  return result.data;
};

export const createManualPosApi = (client: SupabaseClient<Database>) => ({
  async listPaymentMethods(establishmentId: string) {
    requireUuid(establishmentId, 'establishment_id');
    const data = await invokeRpc(client, 'list_establishment_payment_methods', {
      target_establishment_id: establishmentId,
    });
    const mapped = mapPaymentMethodsReadModel(data);
    if (!mapped) throw new ManualPosApiError('invalid_response');
    return mapped;
  },

  async configurePaymentMethod(input: {
    establishmentId: string;
    methodType: EstablishmentPaymentMethodType;
    displayName: string;
    active: boolean;
    requiresReference: boolean;
    expectedVersion: number | null;
    requestId: string;
  }) {
    requireUuid(input.establishmentId, 'establishment_id');
    requireUuid(input.requestId, 'request_id');
    if (input.expectedVersion !== null) requireVersion(input.expectedVersion);
    if (!PAYMENT_METHOD_TYPES.has(input.methodType) || !input.displayName.trim()) {
      throw new ManualPosApiError('invalid_request');
    }
    const data = await invokeRpc(client, 'configure_establishment_payment_method', {
      target_establishment_id: input.establishmentId,
      target_method_type: input.methodType,
      target_display_name: input.displayName.trim(),
      target_active: input.active,
      target_requires_reference: input.requiresReference,
      target_expected_version: input.expectedVersion,
      target_request_id: input.requestId,
    });
    const mapped = mapMethodReceipt(data);
    if (!mapped) throw new ManualPosApiError('invalid_response');
    return mapped;
  },

  async getPaymentSummary(establishmentId: string, serviceOrderId: string) {
    requireUuid(establishmentId, 'establishment_id');
    requireUuid(serviceOrderId, 'service_order_id');
    const data = await invokeRpc(client, 'get_service_order_payment_summary', {
      target_establishment_id: establishmentId,
      target_service_order_id: serviceOrderId,
    });
    const mapped = mapServiceOrderPaymentSummary(data);
    if (!mapped) throw new ManualPosApiError('invalid_response');
    return mapped;
  },

  async recordPayment(input: {
    establishmentId: string;
    serviceOrderId: string;
    paymentMethodId: string;
    amountCents: number;
    externalReference?: string | null;
    expectedVersion: number;
    requestId: string;
  }) {
    requireUuid(input.establishmentId, 'establishment_id');
    requireUuid(input.serviceOrderId, 'service_order_id');
    requireUuid(input.paymentMethodId, 'payment_method_id');
    requireUuid(input.requestId, 'request_id');
    requireVersion(input.expectedVersion);
    if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) {
      throw new ManualPosApiError('invalid_request');
    }
    const data = await invokeRpc(client, 'record_order_payment', {
      target_establishment_id: input.establishmentId,
      target_service_order_id: input.serviceOrderId,
      target_payment_method_id: input.paymentMethodId,
      target_amount_cents: input.amountCents,
      target_external_reference: input.externalReference?.trim() || null,
      target_expected_version: input.expectedVersion,
      target_request_id: input.requestId,
    });
    const mapped = mapPaymentReceipt(data);
    if (!mapped) throw new ManualPosApiError('invalid_response');
    return mapped;
  },

  async voidPayment(input: {
    establishmentId: string;
    serviceOrderId: string;
    paymentEntryId: string;
    reason: string;
    expectedVersion: number;
    requestId: string;
  }) {
    requireUuid(input.establishmentId, 'establishment_id');
    requireUuid(input.serviceOrderId, 'service_order_id');
    requireUuid(input.paymentEntryId, 'payment_entry_id');
    requireUuid(input.requestId, 'request_id');
    requireVersion(input.expectedVersion);
    if (input.reason.trim().length < 3) throw new ManualPosApiError('invalid_request');
    const data = await invokeRpc(client, 'void_order_payment', {
      target_establishment_id: input.establishmentId,
      target_service_order_id: input.serviceOrderId,
      target_payment_entry_id: input.paymentEntryId,
      target_reason: input.reason.trim(),
      target_expected_version: input.expectedVersion,
      target_request_id: input.requestId,
    });
    const mapped = mapPaymentReceipt(data);
    if (!mapped) throw new ManualPosApiError('invalid_response');
    return mapped;
  },
});
