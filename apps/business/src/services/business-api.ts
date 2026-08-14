import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createServiceOrderApi,
  mapBusinessAgendaItem,
  mapBusinessAppointmentDetail,
  mapBusinessInvitationAcceptance,
  mapBusinessInvitationDetails,
  mapBusinessOperationalContext,
  ServiceOrderApiError,
  type AppointmentServiceOrderContext,
  type BusinessAgendaItem,
  type BusinessAgendaScope,
  type BusinessAppointmentDetail,
  type BusinessInvitationAcceptance,
  type BusinessInvitationDetails,
  type BusinessOperationalContext,
  type BusinessRpcArgs,
  type BusinessRpcName,
  type Database,
  type ServiceOrderCommandReceipt,
} from '@cutsync/database';

import { supabase } from '../lib/supabase';

export type BusinessApiErrorCode =
  | 'client_unavailable'
  | 'invalid_request'
  | 'network_error'
  | 'unauthorized'
  | 'forbidden'
  | 'backend_unavailable'
  | 'invalid_response'
  | 'contexts_unavailable'
  | 'agenda_unavailable'
  | 'appointment_unavailable'
  | 'service_order_unavailable'
  | 'invitation_unavailable'
  | 'invitation_invalid'
  | 'invitation_expired'
  | 'invitation_email_mismatch'
  | 'invitation_already_used'
  | 'invitation_accept_failed'
  | 'financial_ops_disabled'
  | 'service_order_already_exists'
  | 'service_order_version_conflict'
  | 'service_order_invalid_transition'
  | 'service_order_items_required'
  | 'appointment_completion_requires_service_order'
  | 'appointment_has_service_order';

const ERROR_MESSAGES: Record<BusinessApiErrorCode, string> = {
  client_unavailable: 'O aplicativo ainda não está conectado ao CutSync.',
  invalid_request: 'Os dados informados são inválidos.',
  network_error: 'Não foi possível conectar. Verifique sua internet e tente novamente.',
  unauthorized: 'Sua sessão expirou. Entre novamente para continuar.',
  forbidden: 'Você não possui permissão para esta operação.',
  backend_unavailable: 'O Business ainda precisa da atualização mais recente do CutSync.',
  invalid_response: 'O CutSync retornou dados inválidos. Tente novamente.',
  contexts_unavailable: 'Não foi possível carregar seus estabelecimentos.',
  agenda_unavailable: 'Não foi possível carregar a agenda.',
  appointment_unavailable: 'Não foi possível carregar o atendimento.',
  service_order_unavailable: 'Não foi possível carregar a comanda.',
  invitation_unavailable: 'Não foi possível consultar este convite.',
  invitation_invalid: 'Este convite é inválido.',
  invitation_expired: 'Este convite expirou. Solicite um novo link.',
  invitation_email_mismatch: 'Entre com a conta que possui o contato confirmado do convite.',
  invitation_already_used: 'Este convite não está mais disponível.',
  invitation_accept_failed: 'Não foi possível aceitar este convite.',
  financial_ops_disabled: 'As operações financeiras ainda não estão ativas nesta unidade.',
  service_order_already_exists: 'A comanda já foi aberta. Atualizando o atendimento.',
  service_order_version_conflict:
    'A comanda foi atualizada em outro dispositivo. Recarregue e tente novamente.',
  service_order_invalid_transition: 'O estado deste atendimento mudou. Atualize os dados.',
  service_order_items_required: 'Adicione ao menos um item antes de finalizar.',
  appointment_completion_requires_service_order:
    'Para concluir este atendimento, abra e finalize a comanda.',
  appointment_has_service_order:
    'Este atendimento já possui comanda e não pode ser alterado por este caminho.',
};

export class BusinessApiError extends Error {
  readonly code: BusinessApiErrorCode;

  constructor(code: BusinessApiErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = 'BusinessApiError';
    this.code = code;
  }
}

export interface BusinessApi {
  getOperationalContexts: () => Promise<BusinessOperationalContext[]>;
  getAgendaDay: (
    establishmentId: string,
    localDate: string,
    scope: BusinessAgendaScope,
  ) => Promise<BusinessAgendaItem[]>;
  getAppointmentDetail: (
    establishmentId: string,
    appointmentId: string,
  ) => Promise<BusinessAppointmentDetail>;
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
  inspectInvitation: (token: string) => Promise<BusinessInvitationDetails>;
  acceptInvitation: (
    token: string,
    requestId: string,
  ) => Promise<BusinessInvitationAcceptance>;
}

type RpcResult = {
  data: unknown;
  error: unknown;
};

type RpcCaller = <Name extends BusinessRpcName>(
  name: Name,
  args?: BusinessRpcArgs<Name>,
) => PromiseLike<RpcResult>;

type Operation =
  | 'contexts'
  | 'agenda'
  | 'appointment'
  | 'service_order'
  | 'inspect_invitation'
  | 'accept_invitation';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INVITATION_TOKEN_PATTERN = /^[0-9a-f]{64}$/;
const LOCAL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const invokeRpc = async <Name extends BusinessRpcName>(
  client: SupabaseClient<Database>,
  name: Name,
  args?: BusinessRpcArgs<Name>,
): Promise<RpcResult> => {
  const caller = client.rpc.bind(client) as unknown as RpcCaller;
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

const genericCodeFor = (operation: Operation): BusinessApiErrorCode => {
  if (operation === 'contexts') return 'contexts_unavailable';
  if (operation === 'agenda') return 'agenda_unavailable';
  if (operation === 'appointment') return 'appointment_unavailable';
  if (operation === 'service_order') return 'service_order_unavailable';
  if (operation === 'inspect_invitation') return 'invitation_unavailable';
  return 'invitation_accept_failed';
};

const translateServiceOrderCode = (code: string): BusinessApiErrorCode | null => {
  switch (code) {
    case 'financial_ops_disabled':
    case 'service_order_already_exists':
    case 'service_order_version_conflict':
    case 'service_order_invalid_transition':
    case 'service_order_items_required':
    case 'appointment_completion_requires_service_order':
    case 'appointment_has_service_order':
    case 'network_error':
    case 'unauthorized':
    case 'forbidden':
    case 'backend_unavailable':
    case 'invalid_request':
    case 'invalid_response':
      return code;
    default:
      return null;
  }
};

const translateRpcError = (operation: Operation, error: unknown): BusinessApiError => {
  if (error instanceof ServiceOrderApiError) {
    const mapped = translateServiceOrderCode(error.code);
    if (mapped) return new BusinessApiError(mapped);
    return new BusinessApiError(genericCodeFor(operation));
  }

  const text = remoteErrorText(error);

  if (text.includes('financial_ops_disabled')) {
    return new BusinessApiError('financial_ops_disabled');
  }
  if (text.includes('service_order_already_exists')) {
    return new BusinessApiError('service_order_already_exists');
  }
  if (text.includes('service_order_version_conflict')) {
    return new BusinessApiError('service_order_version_conflict');
  }
  if (text.includes('service_order_invalid_transition')) {
    return new BusinessApiError('service_order_invalid_transition');
  }
  if (text.includes('service_order_items_required')) {
    return new BusinessApiError('service_order_items_required');
  }
  if (text.includes('appointment_completion_requires_service_order')) {
    return new BusinessApiError('appointment_completion_requires_service_order');
  }
  if (text.includes('appointment_has_service_order')) {
    return new BusinessApiError('appointment_has_service_order');
  }
  if (text.includes('invalid_invitation_token')) return new BusinessApiError('invitation_invalid');
  if (text.includes('expired_invitation')) return new BusinessApiError('invitation_expired');
  if (text.includes('invitation_email_mismatch') || text.includes('invitation_contact_mismatch')) {
    return new BusinessApiError('invitation_email_mismatch');
  }
  if (text.includes('invalid_or_used_invitation')) {
    return new BusinessApiError('invitation_already_used');
  }
  if (text.includes('network') || text.includes('fetch')) return new BusinessApiError('network_error');
  if (text.includes('pgrst301') || text.includes('jwt') || text.includes('not authenticated')) {
    return new BusinessApiError('unauthorized');
  }
  if (text.includes('42501') || text.includes('forbidden') || text.includes('permission denied')) {
    return new BusinessApiError('forbidden');
  }
  if (text.includes('pgrst202') || text.includes('could not find the function')) {
    return new BusinessApiError('backend_unavailable');
  }
  return new BusinessApiError(genericCodeFor(operation));
};

const isLocalDate = (value: string): boolean => {
  const match = LOCAL_DATE_PATTERN.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
};

const asRows = (data: unknown): unknown[] | null => {
  if (data === null) return [];
  return Array.isArray(data) ? data : null;
};

const requireClient = (
  client: SupabaseClient<Database> | null,
): SupabaseClient<Database> => {
  if (!client) throw new BusinessApiError('client_unavailable');
  return client;
};

const requireToken = (token: string): string => {
  if (!INVITATION_TOKEN_PATTERN.test(token)) throw new BusinessApiError('invitation_invalid');
  return token;
};

const requireRequestId = (requestId: string): string => {
  if (!UUID_PATTERN.test(requestId)) throw new BusinessApiError('invalid_request');
  return requestId;
};

export const createBusinessApi = (
  nullableClient: SupabaseClient<Database> | null,
): BusinessApi => ({
  async getOperationalContexts() {
    const client = requireClient(nullableClient);
    let result: RpcResult;
    try {
      result = await invokeRpc(client, 'get_my_business_operational_contexts');
    } catch (error) {
      throw translateRpcError('contexts', error);
    }
    if (result.error) throw translateRpcError('contexts', result.error);

    const rows = asRows(result.data);
    if (!rows) throw new BusinessApiError('invalid_response');
    const contexts = rows.flatMap((row) => {
      const context = mapBusinessOperationalContext(row);
      return context ? [context] : [];
    });
    if (contexts.length !== rows.length) throw new BusinessApiError('invalid_response');
    return contexts;
  },

  async getAgendaDay(establishmentId, localDate, scope) {
    if (
      !UUID_PATTERN.test(establishmentId)
      || !isLocalDate(localDate)
      || (scope !== 'own' && scope !== 'team')
    ) {
      throw new BusinessApiError('invalid_request');
    }

    const client = requireClient(nullableClient);
    let result: RpcResult;
    try {
      result = await invokeRpc(client, 'get_business_agenda_day', {
        target_establishment_id: establishmentId,
        target_local_date: localDate,
        target_scope: scope,
      });
    } catch (error) {
      throw translateRpcError('agenda', error);
    }
    if (result.error) throw translateRpcError('agenda', result.error);

    const rows = asRows(result.data);
    if (!rows) throw new BusinessApiError('invalid_response');
    const agenda = rows.flatMap((row) => {
      const item = mapBusinessAgendaItem(row);
      return item ? [item] : [];
    });
    if (agenda.length !== rows.length) throw new BusinessApiError('invalid_response');
    return agenda;
  },

  async getAppointmentDetail(establishmentId, appointmentId) {
    if (!UUID_PATTERN.test(establishmentId) || !appointmentId.trim()) {
      throw new BusinessApiError('invalid_request');
    }
    const client = requireClient(nullableClient);
    let result: RpcResult;
    try {
      result = await invokeRpc(client, 'get_business_appointment_detail', {
        target_establishment_id: establishmentId,
        target_appointment_id: appointmentId.trim(),
      });
    } catch (error) {
      throw translateRpcError('appointment', error);
    }
    if (result.error) throw translateRpcError('appointment', result.error);
    const detail = mapBusinessAppointmentDetail(result.data);
    if (!detail) throw new BusinessApiError('invalid_response');
    return detail;
  },

  async getServiceOrderForAppointment(establishmentId, appointmentId) {
    const client = requireClient(nullableClient);
    try {
      return await createServiceOrderApi(client).getServiceOrderForAppointment(
        establishmentId,
        appointmentId,
      );
    } catch (error) {
      throw translateRpcError('service_order', error);
    }
  },

  async openServiceOrder(input) {
    const client = requireClient(nullableClient);
    try {
      return await createServiceOrderApi(client).openServiceOrder(input);
    } catch (error) {
      throw translateRpcError('service_order', error);
    }
  },

  async startServiceOrder(input) {
    const client = requireClient(nullableClient);
    try {
      return await createServiceOrderApi(client).startServiceOrder(input);
    } catch (error) {
      throw translateRpcError('service_order', error);
    }
  },

  async finishServiceOrder(input) {
    const client = requireClient(nullableClient);
    try {
      return await createServiceOrderApi(client).finishServiceOrder(input);
    } catch (error) {
      throw translateRpcError('service_order', error);
    }
  },

  async voidServiceOrder(input) {
    const client = requireClient(nullableClient);
    try {
      return await createServiceOrderApi(client).voidServiceOrder(input);
    } catch (error) {
      throw translateRpcError('service_order', error);
    }
  },

  async reopenVoidedServiceOrder(input) {
    const client = requireClient(nullableClient);
    try {
      return await createServiceOrderApi(client).reopenVoidedServiceOrder(input);
    } catch (error) {
      throw translateRpcError('service_order', error);
    }
  },

  async inspectInvitation(token) {
    const invitationToken = requireToken(token);
    const client = requireClient(nullableClient);
    let result: RpcResult;
    try {
      result = await invokeRpc(client, 'inspect_business_invitation_token', {
        target_invitation_token: invitationToken,
      });
    } catch (error) {
      throw translateRpcError('inspect_invitation', error);
    }
    if (result.error) throw translateRpcError('inspect_invitation', result.error);

    const rows = asRows(result.data);
    const invitation = rows?.length === 1 ? mapBusinessInvitationDetails(rows[0]) : null;
    if (!invitation) throw new BusinessApiError('invalid_response');
    return invitation;
  },

  async acceptInvitation(token, requestId) {
    const invitationToken = requireToken(token);
    const commandRequestId = requireRequestId(requestId);
    const client = requireClient(nullableClient);
    let result: RpcResult;
    try {
      result = await invokeRpc(client, 'accept_business_invitation_token', {
        target_invitation_token: invitationToken,
        target_request_id: commandRequestId,
      });
    } catch (error) {
      throw translateRpcError('accept_invitation', error);
    }
    if (result.error) throw translateRpcError('accept_invitation', result.error);

    const rows = asRows(result.data);
    const acceptance = rows?.length === 1 ? mapBusinessInvitationAcceptance(rows[0]) : null;
    if (!acceptance) throw new BusinessApiError('invalid_response');
    return acceptance;
  },
});

export const businessApi = createBusinessApi(supabase);
