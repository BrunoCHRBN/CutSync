import {
  mapAppointmentReassignmentMutationReceipt,
  mapBusinessReassignmentCandidate,
  mapDecisionQueueItem,
  type AppointmentReassignmentMutationReceipt,
  type BusinessReassignmentCandidate,
  type DecisionQueueItem,
} from '@cutsync/database';

import { supabase } from '../../services/supabase';

export type WebReassignmentErrorCode =
  | 'network_error'
  | 'conflict'
  | 'forbidden'
  | 'invalid_transition'
  | 'backend_unavailable'
  | 'invalid_response';

const messages: Record<WebReassignmentErrorCode, string> = {
  network_error: 'Sem conexão. Tente novamente para confirmar o mesmo comando.',
  conflict: 'O atendimento mudou. Atualize a agenda antes de continuar.',
  forbidden: 'Seu acesso não permite esta ação ou a reatribuição está desativada.',
  invalid_transition: 'Esta solicitação já avançou e precisa ser atualizada.',
  backend_unavailable: 'Esta operação requer a atualização mais recente do CutSync.',
  invalid_response: 'O servidor retornou uma resposta inválida.',
};

export class WebReassignmentError extends Error {
  readonly code: WebReassignmentErrorCode;

  constructor(code: WebReassignmentErrorCode) {
    super(messages[code]);
    this.name = 'WebReassignmentError';
    this.code = code;
  }
}

const remoteText = (error: unknown) => {
  if (!error || typeof error !== 'object') return String(error ?? '').toLowerCase();
  const record = error as Record<string, unknown>;
  return ['code', 'message', 'details', 'hint']
    .map((key) => record[key])
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLowerCase();
};

const translateError = (error: unknown) => {
  const text = remoteText(error);
  if (text.includes('network') || text.includes('fetch') || text.includes('timeout')) {
    return new WebReassignmentError('network_error');
  }
  if (text.includes('conflict') || text.includes('version') || text.includes('projection_mismatch')) {
    return new WebReassignmentError('conflict');
  }
  if (text.includes('42501') || text.includes('forbidden') || text.includes('disabled')) {
    return new WebReassignmentError('forbidden');
  }
  if (text.includes('not_validatable') || text.includes('not_proposable') || text.includes('expired')) {
    return new WebReassignmentError('invalid_transition');
  }
  if (text.includes('pgrst202') || text.includes('could not find the function')) {
    return new WebReassignmentError('backend_unavailable');
  }
  return new WebReassignmentError('invalid_response');
};

const rpc = async (name: string, args: Record<string, unknown>) => {
  let result: { data: unknown; error: unknown };
  try {
    result = await (supabase.rpc as unknown as (
      rpcName: string,
      rpcArgs: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: unknown }>)(name, args);
  } catch (error) {
    throw translateError(error);
  }
  if (result.error) throw translateError(result.error);
  return result.data;
};

const mapReceipt = (value: unknown) => {
  const receipt = mapAppointmentReassignmentMutationReceipt(value);
  if (!receipt) throw new WebReassignmentError('invalid_response');
  return receipt;
};

export const webReassignmentApi = {
  async listQueue(establishmentId: string): Promise<DecisionQueueItem[]> {
    const data = await rpc('list_business_decision_queue', {
      target_establishment_id: establishmentId,
    });
    if (!Array.isArray(data)) throw new WebReassignmentError('invalid_response');
    const items = data.map(mapDecisionQueueItem);
    if (items.some((item) => item === null)) throw new WebReassignmentError('invalid_response');
    return items as DecisionQueueItem[];
  },

  async request(input: {
    appointmentId: string;
    reasonCode: string;
    responsibility: string;
    dueAt: string;
    expectedAppointmentUpdatedAt: string;
    requestId: string;
    correlationId: string;
  }): Promise<AppointmentReassignmentMutationReceipt> {
    return mapReceipt(await rpc('request_appointment_reassignment', {
      target_appointment_id: input.appointmentId,
      target_reason_code: input.reasonCode,
      target_responsibility: input.responsibility,
      target_due_at: input.dueAt,
      target_expected_appointment_updated_at: input.expectedAppointmentUpdatedAt,
      target_request_id: input.requestId,
      target_correlation_id: input.correlationId,
    }));
  },

  async validate(input: {
    reassignmentRequestId: string;
    expectedVersion: number;
    requestId: string;
  }): Promise<AppointmentReassignmentMutationReceipt> {
    return mapReceipt(await rpc('validate_appointment_reassignment', {
      target_reassignment_request_id: input.reassignmentRequestId,
      target_expected_version: input.expectedVersion,
      target_request_id: input.requestId,
    }));
  },

  async listCandidates(
    establishmentId: string,
    reassignmentRequestId: string,
  ): Promise<BusinessReassignmentCandidate[]> {
    const data = await rpc('list_business_reassignment_candidates', {
      target_establishment_id: establishmentId,
      target_reassignment_request_id: reassignmentRequestId,
    });
    if (!Array.isArray(data)) throw new WebReassignmentError('invalid_response');
    const candidates = data.map(mapBusinessReassignmentCandidate);
    if (candidates.some((candidate) => candidate === null)) {
      throw new WebReassignmentError('invalid_response');
    }
    return candidates as BusinessReassignmentCandidate[];
  },

  async propose(input: {
    reassignmentRequestId: string;
    professionalId: string;
    expectedVersion: number;
    requestId: string;
  }): Promise<AppointmentReassignmentMutationReceipt> {
    return mapReceipt(await rpc('propose_appointment_reassignment', {
      target_reassignment_request_id: input.reassignmentRequestId,
      target_proposed_professional_id: input.professionalId,
      target_expected_version: input.expectedVersion,
      target_request_id: input.requestId,
    }));
  },
};
