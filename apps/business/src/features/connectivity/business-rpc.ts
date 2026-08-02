import type {
  BusinessRpcArgs,
  BusinessRpcName,
  BusinessRpcReturns,
  Database,
} from '@cutsync/database';
import type { SupabaseClient } from '@supabase/supabase-js';

import { businessObservability } from '@/features/observability/business-observability';
import { supabase } from '@/lib/supabase';

export type BusinessFeatureErrorCode =
  | 'client_unavailable'
  | 'invalid_request'
  | 'network_error'
  | 'unauthorized'
  | 'forbidden'
  | 'read_only'
  | 'backend_unavailable'
  | 'invalid_response'
  | 'not_found'
  | 'conflict'
  | 'idempotency_conflict'
  | 'invalid_transition'
  | 'appointment_overlap'
  | 'active_appointment_conflict';

const messages: Record<BusinessFeatureErrorCode, string> = {
  client_unavailable: 'O aplicativo ainda não está conectado ao CutSync.',
  invalid_request: 'Revise os dados informados e tente novamente.',
  network_error: 'Sem conexão. Reconecte e repita a tentativa com segurança.',
  unauthorized: 'Sua sessão expirou. Entre novamente para continuar.',
  forbidden: 'Sua função não permite esta operação.',
  read_only: 'Esta unidade está em modo somente leitura.',
  backend_unavailable: 'Esta operação requer a atualização mais recente do CutSync.',
  invalid_response: 'O CutSync retornou uma resposta inválida.',
  not_found: 'O recurso não existe ou não está disponível para sua função.',
  conflict: 'O recurso foi alterado. Atualize os dados e tente novamente.',
  idempotency_conflict: 'Esta tentativa não corresponde ao comando original.',
  invalid_transition: 'O estado atual não permite esta ação.',
  appointment_overlap: 'Este horário não está mais disponível.',
  active_appointment_conflict: 'O bloqueio afetaria um atendimento ativo.',
};

export class BusinessFeatureError extends Error {
  readonly code: BusinessFeatureErrorCode;

  constructor(code: BusinessFeatureErrorCode) {
    super(messages[code]);
    this.name = 'BusinessFeatureError';
    this.code = code;
  }
}

export type RpcRecord = Record<string, unknown>;

type RpcResult = { data: unknown; error: unknown };
type LooseRpcCaller = (
  name: string,
  args?: RpcRecord,
) => PromiseLike<RpcResult>;

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isRpcRecord = (value: unknown): value is RpcRecord => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

export const assertUuid = (value: string) => {
  if (!UUID_PATTERN.test(value)) throw new BusinessFeatureError('invalid_request');
  return value;
};

export const assertIsoTimestamp = (value: string) => {
  if (!Number.isFinite(Date.parse(value))) throw new BusinessFeatureError('invalid_request');
  return value;
};

const remoteErrorText = (error: unknown) => {
  if (!isRpcRecord(error)) return '';
  return ['code', 'message', 'details', 'hint']
    .map((key) => error[key])
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLowerCase();
};

const translateError = (error: unknown): BusinessFeatureError => {
  const text = remoteErrorText(error);
  if (text.includes('idempotency_conflict')) return new BusinessFeatureError('idempotency_conflict');
  if (text.includes('invalid_transition') || text.includes('invalid_appointment_status')) {
    return new BusinessFeatureError('invalid_transition');
  }
  if (
    text.includes('appointment_overlap')
    || text.includes('appointment_conflict')
    || text.includes('slot_unavailable')
  ) {
    return new BusinessFeatureError('appointment_overlap');
  }
  if (
    text.includes('active_appointment_conflict')
    || text.includes('schedule_block_conflict')
    || text.includes('block_conflicts')
  ) {
    return new BusinessFeatureError('active_appointment_conflict');
  }
  if (text.includes('not_found')) return new BusinessFeatureError('not_found');
  if (text.includes('read_only')) return new BusinessFeatureError('read_only');
  if (text.includes('pgrst301') || text.includes('jwt') || text.includes('not authenticated')) {
    return new BusinessFeatureError('unauthorized');
  }
  if (text.includes('42501') || text.includes('forbidden') || text.includes('permission denied')) {
    return new BusinessFeatureError('forbidden');
  }
  if (text.includes('pgrst202') || text.includes('could not find the function')) {
    return new BusinessFeatureError('backend_unavailable');
  }
  if (text.includes('network') || text.includes('fetch') || text.includes('timeout')) {
    return new BusinessFeatureError('network_error');
  }
  if (text.includes('conflict')) return new BusinessFeatureError('conflict');
  return new BusinessFeatureError('invalid_request');
};

const translateResponseError = (data: unknown): BusinessFeatureError | null => {
  if (!isRpcRecord(data) || !Object.hasOwn(data, 'errorCode')) return null;
  if (data.errorCode === 'appointment_conflict') {
    return new BusinessFeatureError('appointment_overlap');
  }
  if (data.errorCode === 'schedule_block_conflict') {
    return new BusinessFeatureError('active_appointment_conflict');
  }
  return new BusinessFeatureError('invalid_response');
};

const requireClient = (
  client: SupabaseClient<Database> | null,
): SupabaseClient<Database> => {
  if (!client) throw new BusinessFeatureError('client_unavailable');
  return client;
};

export const callBusinessRpc = async <Name extends BusinessRpcName>(
  name: Name,
  args: BusinessRpcArgs<Name> extends never ? undefined : BusinessRpcArgs<Name>,
  nullableClient: SupabaseClient<Database> | null = supabase,
): Promise<BusinessRpcReturns<Name>> => {
  const client = requireClient(nullableClient);
  const caller = client.rpc.bind(client) as unknown as LooseRpcCaller;
  const rpcArgs = args as RpcRecord | undefined;
  const captureTranslatedFailure = (translated: BusinessFeatureError) => {
    businessObservability.captureError(translated, `business_rpc_${translated.code}`, {
      operation: name,
      correlationId: typeof rpcArgs?.target_request_id === 'string'
        ? rpcArgs.target_request_id
        : undefined,
    });
    return translated;
  };
  const captureFailure = (error: unknown) => (
    captureTranslatedFailure(translateError(error))
  );
  let result: RpcResult;
  try {
    result = await caller(name, rpcArgs);
  } catch (error) {
    throw captureFailure(error);
  }
  if (result.error) throw captureFailure(result.error);
  const responseError = translateResponseError(result.data);
  if (responseError) throw captureTranslatedFailure(responseError);
  return result.data as BusinessRpcReturns<Name>;
};
