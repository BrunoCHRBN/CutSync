import {
  mapAppointmentReassignmentMutationReceipt,
  mapBusinessReassignmentCandidate,
  mapClientReassignmentDecision,
  mapClientReassignmentDetail,
  type AppointmentReassignmentMutationReceipt,
  type BusinessReassignmentCandidate,
  type ClientReassignmentDecision,
  type ClientReassignmentDetail,
  type ClientReassignmentAction,
  type Database,
} from '@cutsync/database';
import type { SupabaseClient } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';

type ClientDecisionAction = ClientReassignmentAction;

type RpcResult = { data: unknown; error: unknown };
type RpcCaller = (
  name: string,
  args?: Record<string, unknown>,
) => PromiseLike<RpcResult>;

export class ClientReassignmentApiError extends Error {
  constructor(
    public readonly code: 'unavailable' | 'network' | 'invalid_response' | 'conflict' | 'forbidden' | 'invalid_transition',
    message: string,
  ) {
    super(message);
    this.name = 'ClientReassignmentApiError';
  }
}

const requireClient = (): SupabaseClient<Database> => {
  if (!supabase) {
    throw new ClientReassignmentApiError(
      'unavailable',
      'O aplicativo ainda não está conectado ao CutSync.',
    );
  }
  return supabase;
};

const invokeRpc = async (
  name: string,
  args?: Record<string, unknown>,
): Promise<RpcResult> => {
  const client = requireClient();
  const caller = client.rpc.bind(client) as unknown as RpcCaller;
  return caller(name, args);
};

const errorText = (error: unknown) => {
  const value = error as { code?: string; message?: string; details?: string; hint?: string };
  return [value?.code, value?.message, value?.details, value?.hint]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
};

const translateError = (error: unknown): ClientReassignmentApiError => {
  if (error instanceof ClientReassignmentApiError) return error;
  const text = errorText(error);
  if (
    text.includes('network')
    || text.includes('fetch')
    || text.includes('timeout')
    || text.includes('pgrst301')
    || text.includes('jwt expired')
    || text.includes('jwt has expired')
  ) {
    return new ClientReassignmentApiError(
      'network',
      'Sem conexão. Sua decisão ficará pendente e será reenviada com o mesmo protocolo.',
    );
  }
  if (text.includes('version_conflict') || text.includes('40001')) {
    return new ClientReassignmentApiError(
      'conflict',
      'Esta decisão mudou em outro dispositivo. Atualizamos os dados para você revisar.',
    );
  }
  if (text.includes('forbidden') || text.includes('42501')) {
    return new ClientReassignmentApiError(
      'forbidden',
      'Esta decisão não está disponível para a sua conta.',
    );
  }
  if (
    text.includes('not_awaiting_decision')
    || text.includes('expired')
    || text.includes('invalid_customer_change_decision')
    || text.includes('22023')
  ) {
    return new ClientReassignmentApiError(
      'invalid_transition',
      'Esta decisão não pode mais ser enviada. Revise o estado mais recente.',
    );
  }
  return new ClientReassignmentApiError(
    'unavailable',
    'Não foi possível carregar ou enviar esta decisão agora.',
  );
};

const mapArray = <T>(
  value: unknown,
  mapper: (item: unknown) => T | null,
): T[] => {
  if (!Array.isArray(value)) {
    throw new ClientReassignmentApiError('invalid_response', 'O CutSync retornou dados inválidos.');
  }
  const mapped = value.map(mapper);
  if (mapped.some((item) => item === null)) {
    throw new ClientReassignmentApiError('invalid_response', 'O CutSync retornou dados inválidos.');
  }
  return mapped as T[];
};

export const listClientReassignmentDecisions = async (): Promise<ClientReassignmentDecision[]> => {
  try {
    const { data, error } = await invokeRpc('list_client_reassignment_decisions');
    if (error) throw error;
    return mapArray(data, mapClientReassignmentDecision);
  } catch (error) {
    throw translateError(error);
  }
};

export const loadClientReassignmentDetail = async (
  appointmentId: string,
): Promise<ClientReassignmentDetail | null> => {
  try {
    const { data, error } = await invokeRpc('get_client_reassignment_detail', {
      target_appointment_id: appointmentId,
    });
    if (error) throw error;
    if (data === null) return null;
    const mapped = mapClientReassignmentDetail(data);
    if (!mapped) {
      throw new ClientReassignmentApiError('invalid_response', 'O CutSync retornou dados inválidos.');
    }
    return mapped;
  } catch (error) {
    throw translateError(error);
  }
};

export const listClientReassignmentCandidates = async (
  reassignmentRequestId: string,
): Promise<BusinessReassignmentCandidate[]> => {
  try {
    const { data, error } = await invokeRpc('list_client_reassignment_candidates', {
      target_reassignment_request_id: reassignmentRequestId,
    });
    if (error) throw error;
    return mapArray(data, mapBusinessReassignmentCandidate);
  } catch (error) {
    throw translateError(error);
  }
};

export const decideClientReassignment = async (input: {
  reassignmentRequestId: string;
  decision: ClientDecisionAction;
  chosenProfessionalId?: string | null;
  expectedVersion: number;
  requestId: string;
}): Promise<AppointmentReassignmentMutationReceipt> => {
  try {
    const { data, error } = await invokeRpc('decide_appointment_reassignment', {
      target_reassignment_request_id: input.reassignmentRequestId,
      target_decision: input.decision,
      target_chosen_professional_id: input.chosenProfessionalId ?? null,
      target_channel: 'client_app',
      target_reason: null,
      target_expected_version: input.expectedVersion,
      target_request_id: input.requestId,
    });
    if (error) throw error;
    const receipt = mapAppointmentReassignmentMutationReceipt(data);
    if (!receipt) {
      throw new ClientReassignmentApiError('invalid_response', 'O CutSync retornou dados inválidos.');
    }
    return receipt;
  } catch (error) {
    throw translateError(error);
  }
};

export type { ClientDecisionAction };
