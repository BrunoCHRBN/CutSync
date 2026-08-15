import type { SupabaseClient } from '@supabase/supabase-js';

import {
  mapAppointmentServiceOrderContext,
  mapServiceOrderCommandReceipt,
  type AppointmentServiceOrderContext,
  type ServiceOrderCommandReceipt,
} from './business';
import type { BusinessRpcArgs, BusinessRpcName } from './business-rpc.generated';
import type { Database } from './supabase.generated';

export type ServiceOrderApiErrorCode =
  | 'invalid_request'
  | 'network_error'
  | 'unauthorized'
  | 'forbidden'
  | 'backend_unavailable'
  | 'invalid_response'
  | 'financial_ops_disabled'
  | 'service_order_already_exists'
  | 'service_order_version_conflict'
  | 'service_order_invalid_transition'
  | 'service_order_items_required'
  | 'appointment_completion_requires_service_order'
  | 'appointment_has_service_order'
  | 'service_order_balance_unresolved'
  | 'service_order_unavailable';

export class ServiceOrderApiError extends Error {
  readonly code: ServiceOrderApiErrorCode;

  constructor(code: ServiceOrderApiErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'ServiceOrderApiError';
    this.code = code;
  }
}

type RpcResult = { data: unknown; error: unknown };
type RpcCaller = <Name extends BusinessRpcName>(
  name: Name,
  args?: BusinessRpcArgs<Name>,
) => PromiseLike<RpcResult>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const invokeRpc = async <Name extends BusinessRpcName>(
  client: SupabaseClient<Database>,
  name: Name,
  args?: BusinessRpcArgs<Name>,
): Promise<RpcResult> => {
  const caller = client.rpc as unknown as RpcCaller;
  return caller(name, args);
};

const remoteErrorText = (error: unknown): string => {
  if (!error || typeof error !== 'object') return '';
  const record = error as Record<string, unknown>;
  return ['code', 'message', 'details', 'hint']
    .map((key) => record[key])
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLowerCase();
};

export const translateServiceOrderRpcError = (error: unknown): ServiceOrderApiError => {
  const text = remoteErrorText(error);
  if (text.includes('financial_ops_disabled')) {
    return new ServiceOrderApiError('financial_ops_disabled');
  }
  if (text.includes('service_order_already_exists')) {
    return new ServiceOrderApiError('service_order_already_exists');
  }
  if (text.includes('service_order_version_conflict')) {
    return new ServiceOrderApiError('service_order_version_conflict');
  }
  if (text.includes('service_order_invalid_transition')) {
    return new ServiceOrderApiError('service_order_invalid_transition');
  }
  if (text.includes('service_order_items_required')) {
    return new ServiceOrderApiError('service_order_items_required');
  }
  if (text.includes('appointment_completion_requires_service_order')) {
    return new ServiceOrderApiError('appointment_completion_requires_service_order');
  }
  if (text.includes('appointment_has_service_order')) {
    return new ServiceOrderApiError('appointment_has_service_order');
  }
  if (text.includes('service_order_balance_unresolved')) {
    return new ServiceOrderApiError('service_order_balance_unresolved');
  }
  if (text.includes('network') || text.includes('fetch')) {
    return new ServiceOrderApiError('network_error');
  }
  if (text.includes('pgrst301') || text.includes('jwt') || text.includes('not authenticated')) {
    return new ServiceOrderApiError('unauthorized');
  }
  if (text.includes('42501') || text.includes('forbidden') || text.includes('permission denied')) {
    return new ServiceOrderApiError('forbidden');
  }
  if (text.includes('pgrst202') || text.includes('could not find the function')) {
    return new ServiceOrderApiError('backend_unavailable');
  }
  return new ServiceOrderApiError('service_order_unavailable');
};

const requireUuid = (value: string, field: string): string => {
  if (!UUID_PATTERN.test(value)) {
    throw new ServiceOrderApiError('invalid_request', `invalid_${field}`);
  }
  return value;
};

const requireAppointmentId = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) throw new ServiceOrderApiError('invalid_request', 'invalid_appointment_id');
  return trimmed;
};

const mapReceiptOrThrow = (data: unknown): ServiceOrderCommandReceipt => {
  const receipt = mapServiceOrderCommandReceipt(data);
  if (!receipt) throw new ServiceOrderApiError('invalid_response');
  return receipt;
};

export interface ServiceOrderApi {
  getServiceOrderForAppointment: (
    establishmentId: string,
    appointmentId: string,
  ) => Promise<AppointmentServiceOrderContext>;
  openServiceOrder: (input: {
    establishmentId: string;
    appointmentId: string;
    requestId: string;
  }) => Promise<ServiceOrderCommandReceipt>;
  startServiceOrder: (input: {
    establishmentId: string;
    serviceOrderId: string;
    expectedVersion: number;
    requestId: string;
  }) => Promise<ServiceOrderCommandReceipt>;
  finishServiceOrder: (input: {
    establishmentId: string;
    serviceOrderId: string;
    expectedVersion: number;
    requestId: string;
  }) => Promise<ServiceOrderCommandReceipt>;
  closeServiceOrder: (input: {
    establishmentId: string;
    serviceOrderId: string;
    expectedVersion: number;
    requestId: string;
  }) => Promise<ServiceOrderCommandReceipt>;
  voidServiceOrder: (input: {
    establishmentId: string;
    serviceOrderId: string;
    expectedVersion: number;
    reason: string;
    requestId: string;
  }) => Promise<ServiceOrderCommandReceipt>;
  reopenVoidedServiceOrder: (input: {
    establishmentId: string;
    serviceOrderId: string;
    expectedVersion: number;
    reason: string;
    requestId: string;
  }) => Promise<ServiceOrderCommandReceipt>;
}

export const createServiceOrderApi = (
  client: SupabaseClient<Database>,
): ServiceOrderApi => ({
  async getServiceOrderForAppointment(establishmentId, appointmentId) {
    requireUuid(establishmentId, 'establishment_id');
    const targetAppointmentId = requireAppointmentId(appointmentId);
    let result: RpcResult;
    try {
      result = await invokeRpc(client, 'get_service_order_for_appointment', {
        target_establishment_id: establishmentId,
        target_appointment_id: targetAppointmentId,
      });
    } catch (error) {
      throw translateServiceOrderRpcError(error);
    }
    if (result.error) throw translateServiceOrderRpcError(result.error);
    const mapped = mapAppointmentServiceOrderContext(result.data);
    if (!mapped) throw new ServiceOrderApiError('invalid_response');
    return mapped;
  },

  async openServiceOrder({ establishmentId, appointmentId, requestId }) {
    requireUuid(establishmentId, 'establishment_id');
    requireUuid(requestId, 'request_id');
    const targetAppointmentId = requireAppointmentId(appointmentId);
    let result: RpcResult;
    try {
      result = await invokeRpc(client, 'open_service_order', {
        target_establishment_id: establishmentId,
        target_request_id: requestId,
        target_appointment_id: targetAppointmentId,
      });
    } catch (error) {
      throw translateServiceOrderRpcError(error);
    }
    if (result.error) throw translateServiceOrderRpcError(result.error);
    return mapReceiptOrThrow(result.data);
  },

  async startServiceOrder({
    establishmentId,
    serviceOrderId,
    expectedVersion,
    requestId,
  }) {
    requireUuid(establishmentId, 'establishment_id');
    requireUuid(serviceOrderId, 'service_order_id');
    requireUuid(requestId, 'request_id');
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) {
      throw new ServiceOrderApiError('invalid_request');
    }
    let result: RpcResult;
    try {
      result = await invokeRpc(client, 'start_service_order', {
        target_establishment_id: establishmentId,
        target_service_order_id: serviceOrderId,
        target_expected_version: expectedVersion,
        target_request_id: requestId,
      });
    } catch (error) {
      throw translateServiceOrderRpcError(error);
    }
    if (result.error) throw translateServiceOrderRpcError(result.error);
    return mapReceiptOrThrow(result.data);
  },

  async finishServiceOrder({
    establishmentId,
    serviceOrderId,
    expectedVersion,
    requestId,
  }) {
    requireUuid(establishmentId, 'establishment_id');
    requireUuid(serviceOrderId, 'service_order_id');
    requireUuid(requestId, 'request_id');
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) {
      throw new ServiceOrderApiError('invalid_request');
    }
    let result: RpcResult;
    try {
      result = await invokeRpc(client, 'finish_service_order', {
        target_establishment_id: establishmentId,
        target_service_order_id: serviceOrderId,
        target_expected_version: expectedVersion,
        target_request_id: requestId,
      });
    } catch (error) {
      throw translateServiceOrderRpcError(error);
    }
    if (result.error) throw translateServiceOrderRpcError(result.error);
    return mapReceiptOrThrow(result.data);
  },

  async closeServiceOrder({
    establishmentId,
    serviceOrderId,
    expectedVersion,
    requestId,
  }) {
    requireUuid(establishmentId, 'establishment_id');
    requireUuid(serviceOrderId, 'service_order_id');
    requireUuid(requestId, 'request_id');
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) {
      throw new ServiceOrderApiError('invalid_request');
    }
    let result: RpcResult;
    try {
      result = await invokeRpc(client, 'close_service_order', {
        target_establishment_id: establishmentId,
        target_service_order_id: serviceOrderId,
        target_expected_version: expectedVersion,
        target_request_id: requestId,
      });
    } catch (error) {
      throw translateServiceOrderRpcError(error);
    }
    if (result.error) throw translateServiceOrderRpcError(result.error);
    return mapReceiptOrThrow(result.data);
  },

  async voidServiceOrder({
    establishmentId,
    serviceOrderId,
    expectedVersion,
    reason,
    requestId,
  }) {
    requireUuid(establishmentId, 'establishment_id');
    requireUuid(serviceOrderId, 'service_order_id');
    requireUuid(requestId, 'request_id');
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1 || !reason.trim()) {
      throw new ServiceOrderApiError('invalid_request');
    }
    let result: RpcResult;
    try {
      result = await invokeRpc(client, 'void_service_order', {
        target_establishment_id: establishmentId,
        target_service_order_id: serviceOrderId,
        target_expected_version: expectedVersion,
        target_reason: reason.trim(),
        target_request_id: requestId,
      });
    } catch (error) {
      throw translateServiceOrderRpcError(error);
    }
    if (result.error) throw translateServiceOrderRpcError(result.error);
    return mapReceiptOrThrow(result.data);
  },

  async reopenVoidedServiceOrder({
    establishmentId,
    serviceOrderId,
    expectedVersion,
    reason,
    requestId,
  }) {
    requireUuid(establishmentId, 'establishment_id');
    requireUuid(serviceOrderId, 'service_order_id');
    requireUuid(requestId, 'request_id');
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1 || !reason.trim()) {
      throw new ServiceOrderApiError('invalid_request');
    }
    let result: RpcResult;
    try {
      result = await invokeRpc(client, 'reopen_voided_service_order', {
        target_establishment_id: establishmentId,
        target_service_order_id: serviceOrderId,
        target_expected_version: expectedVersion,
        target_reason: reason.trim(),
        target_request_id: requestId,
      });
    } catch (error) {
      throw translateServiceOrderRpcError(error);
    }
    if (result.error) throw translateServiceOrderRpcError(result.error);
    return mapReceiptOrThrow(result.data);
  },
});
