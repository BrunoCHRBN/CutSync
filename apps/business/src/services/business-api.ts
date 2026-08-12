import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createServiceOrderApi,
  createManualPosApi,
  mapActiveContextReceipt,
  mapAuthorizedContext,
  mapBusinessAgendaItem,
  mapBusinessAppointmentDetail,
  mapBusinessReassignmentDetail,
  mapBusinessReassignmentCandidate,
  mapBusinessInvitationAcceptance,
  mapBusinessInvitationDetails,
  mapBusinessOperationalContext,
  mapDecisionQueueItem,
  mapAppointmentReassignmentMutationReceipt,
  ServiceOrderApiError,
  ManualPosApiError,
  type AppointmentServiceOrderContext,
  type ActiveContextReceipt,
  type AuthorizedContext,
  type BusinessAgendaItem,
  type BusinessAgendaScope,
  type BusinessAppointmentDetail,
  type BusinessReassignmentDetail,
  type BusinessReassignmentCandidate,
  type BusinessInvitationAcceptance,
  type BusinessInvitationDetails,
  type BusinessOperationalContext,
  type DecisionQueueItem,
  type AppointmentReassignmentMutationReceipt,
  type BusinessRpcArgs,
  type BusinessRpcName,
  type Database,
  type ServiceOrderCommandReceipt,
  type EstablishmentPaymentMethodsReadModel,
  type ServiceOrderPaymentSummary,
  type OrderPaymentCommandReceipt,
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
  | 'decisions_unavailable'
  | 'decision_conflict'
  | 'decision_disabled'
  | 'decision_invalid_transition'
  | 'decision_candidate_unavailable'
  | 'decision_idempotency_conflict'
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
  | 'appointment_has_service_order'
  | 'payment_method_unavailable'
  | 'payment_method_version_conflict'
  | 'payment_reference_required'
  | 'payment_exceeds_order_balance'
  | 'payment_entry_not_voidable'
  | 'payment_entry_already_voided'
  | 'service_order_balance_unresolved'
  | 'aal2_required';

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
  decisions_unavailable: 'Não foi possível carregar as decisões desta unidade.',
  decision_conflict: 'Esta decisão mudou em outro dispositivo. Os dados serão atualizados.',
  decision_disabled: 'A reatribuição ainda não está habilitada nesta unidade.',
  decision_invalid_transition: 'Esta ação não está mais disponível no estado atual.',
  decision_candidate_unavailable: 'Este profissional não está mais elegível ou disponível.',
  decision_idempotency_conflict: 'A tentativa não corresponde ao comando original.',
  service_order_unavailable: 'Não foi possível carregar a comanda.',
  invitation_unavailable: 'Não foi possível consultar este convite.',
  invitation_invalid: 'Este convite é inválido.',
  invitation_expired: 'Este convite expirou. Solicite um novo link.',
  invitation_email_mismatch: 'Entre usando exatamente o e-mail que recebeu o convite.',
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
  payment_method_unavailable: 'Este meio de pagamento não está mais disponível.',
  payment_method_version_conflict: 'A configuração deste meio de pagamento mudou. Atualize os dados.',
  payment_reference_required: 'Informe a referência desta operação para continuar.',
  payment_exceeds_order_balance: 'O valor informado excede o saldo da comanda.',
  payment_entry_not_voidable: 'Este lançamento não pode mais ser estornado.',
  payment_entry_already_voided: 'Este lançamento já possui estorno confirmado.',
  service_order_balance_unresolved: 'A comanda ainda possui saldo pendente.',
  aal2_required: 'Confirme sua autenticação em duas etapas para estornar este pagamento.',
};

export class BusinessApiError extends Error {
  readonly code: BusinessApiErrorCode;
  readonly diagnosticCode: string | null;

  constructor(code: BusinessApiErrorCode, diagnosticCode: string | null = null) {
    super(ERROR_MESSAGES[code]);
    this.name = 'BusinessApiError';
    this.code = code;
    this.diagnosticCode = normalizeBusinessDiagnosticCode(diagnosticCode);
  }
}

export const normalizeBusinessDiagnosticCode = (value: string | null): string | null => {
  if (!value) return null;
  const normalized = value.trim().toUpperCase();
  return /^[A-Z0-9_]{2,64}$/.test(normalized) ? normalized : null;
};

export interface BusinessApi {
  getAuthorizedContexts: () => Promise<AuthorizedContext[]>;
  setActiveEstablishmentContext: (input: {
    establishmentId: string;
    requestId: string;
  }) => Promise<ActiveContextReceipt>;
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
  listDecisionQueue: (establishmentId: string) => Promise<DecisionQueueItem[]>;
  getReassignmentDetail: (
    establishmentId: string,
    reassignmentRequestId: string,
  ) => Promise<BusinessReassignmentDetail>;
  listReassignmentCandidates: (
    establishmentId: string,
    reassignmentRequestId: string,
  ) => Promise<BusinessReassignmentCandidate[]>;
  requestReassignment: (input: ReassignmentRequestInput) => Promise<AppointmentReassignmentMutationReceipt>;
  validateReassignment: (input: DecisionCommandInput) => Promise<AppointmentReassignmentMutationReceipt>;
  proposeReassignment: (
    input: DecisionCommandInput & { professionalId: string },
  ) => Promise<AppointmentReassignmentMutationReceipt>;
  applyReassignment: (input: DecisionCommandInput) => Promise<AppointmentReassignmentMutationReceipt>;
  withdrawReassignment: (
    input: DecisionCommandInput & { reason: string },
  ) => Promise<AppointmentReassignmentMutationReceipt>;
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
  listPaymentMethods: (establishmentId: string) => Promise<EstablishmentPaymentMethodsReadModel>;
  getPaymentSummary: (
    establishmentId: string,
    serviceOrderId: string,
  ) => Promise<ServiceOrderPaymentSummary>;
  recordPayment: (input: {
    establishmentId: string;
    serviceOrderId: string;
    paymentMethodId: string;
    amountCents: number;
    externalReference?: string | null;
    expectedVersion: number;
    requestId: string;
  }) => Promise<OrderPaymentCommandReceipt>;
  voidPayment: (input: {
    establishmentId: string;
    serviceOrderId: string;
    paymentEntryId: string;
    reason: string;
    expectedVersion: number;
    requestId: string;
  }) => Promise<OrderPaymentCommandReceipt>;
  inspectInvitation: (token: string) => Promise<BusinessInvitationDetails>;
  acceptInvitation: (token: string) => Promise<BusinessInvitationAcceptance>;
}

interface DecisionCommandInput {
  reassignmentRequestId: string;
  expectedVersion: number;
  requestId: string;
}

interface ReassignmentRequestInput {
  appointmentId: string;
  reasonCode: string;
  responsibility: 'professional' | 'reception' | 'manager' | 'admin' | 'owner';
  dueAt: string;
  expectedAppointmentUpdatedAt: string;
  requestId: string;
  correlationId: string;
}

type RpcResult = {
  data: unknown;
  error: unknown;
};

type RpcCaller = <Name extends BusinessRpcName>(
  name: Name,
  args?: BusinessRpcArgs<Name>,
) => PromiseLike<RpcResult>;

type DecisionRpcName =
  | 'request_appointment_reassignment'
  | 'validate_appointment_reassignment'
  | 'propose_appointment_reassignment'
  | 'apply_appointment_reassignment'
  | 'withdraw_appointment_reassignment';

type DecisionRpcCaller = (
  name: DecisionRpcName,
  args: Record<string, unknown>,
) => PromiseLike<RpcResult>;

type Operation =
  | 'contexts'
  | 'agenda'
  | 'appointment'
  | 'decisions'
  | 'service_order'
  | 'manual_pos'
  | 'inspect_invitation'
  | 'accept_invitation';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INVITATION_TOKEN_PATTERN = /^[0-9a-f]{64}$/;
const LOCAL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DECISION_RPC_TIMEOUT_MS = 12_000;

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

const remoteErrorCode = (error: unknown): string | null => {
  if (!error || typeof error !== 'object') return null;
  const code = (error as Record<string, unknown>).code;
  if (typeof code !== 'string') return null;
  const normalized = normalizeBusinessDiagnosticCode(code);
  return normalized && normalized.length <= 48 ? normalized : null;
};

const logSanitizedRpcError = (operation: Operation, error: unknown) => {
  if (!__DEV__) return;
  const record = error && typeof error === 'object'
    ? error as Record<string, unknown>
    : null;
  const name = typeof record?.name === 'string'
    ? normalizeBusinessDiagnosticCode(record.name)
    : null;
  const status = typeof record?.status === 'number' && Number.isInteger(record.status)
    ? record.status
    : null;
  console.warn('BUSINESS_RPC_FAILURE', {
    operation,
    code: remoteErrorCode(error),
    name,
    status,
  });
};

const genericCodeFor = (operation: Operation): BusinessApiErrorCode => {
  if (operation === 'contexts') return 'contexts_unavailable';
  if (operation === 'agenda') return 'agenda_unavailable';
  if (operation === 'appointment') return 'appointment_unavailable';
  if (operation === 'decisions') return 'decisions_unavailable';
  if (operation === 'service_order') return 'service_order_unavailable';
  if (operation === 'manual_pos') return 'service_order_unavailable';
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
    case 'service_order_balance_unresolved':
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
  logSanitizedRpcError(operation, error);
  if (error instanceof ServiceOrderApiError) {
    const mapped = translateServiceOrderCode(error.code);
    if (mapped) return new BusinessApiError(mapped);
    return new BusinessApiError(genericCodeFor(operation));
  }

  if (error instanceof ManualPosApiError) {
    const supported = new Set<BusinessApiErrorCode>([
      'invalid_request', 'network_error', 'unauthorized', 'forbidden',
      'backend_unavailable', 'invalid_response', 'financial_ops_disabled',
      'payment_method_unavailable', 'payment_method_version_conflict',
      'payment_reference_required', 'payment_exceeds_order_balance',
      'payment_entry_not_voidable', 'payment_entry_already_voided',
      'service_order_version_conflict', 'service_order_invalid_transition',
      'service_order_balance_unresolved', 'aal2_required',
    ]);
    if (supported.has(error.code as BusinessApiErrorCode)) {
      return new BusinessApiError(error.code as BusinessApiErrorCode);
    }
    return new BusinessApiError(genericCodeFor(operation));
  }
  const text = remoteErrorText(error);

  if (text.includes('idempotency_key_reused')) {
    return new BusinessApiError('decision_idempotency_conflict');
  }
  if (
    text.includes('reassignment_version_conflict')
    || text.includes('appointment_version_conflict')
    || text.includes('appointment_assignment_projection_mismatch')
    || text.includes('reassignment_proposal_changed')
  ) return new BusinessApiError('decision_conflict');
  if (
    text.includes('appointment_reassignment_disabled')
  ) return new BusinessApiError('decision_disabled');
  if (
    text.includes('reassignment_not_validatable')
    || text.includes('reassignment_not_proposable')
    || text.includes('reassignment_not_ready_to_apply')
    || text.includes('reassignment_not_withdrawable')
    || text.includes('appointment_reassignment_expired')
    || text.includes('appointment_not_reassignable')
    || text.includes('appointment_reassignment_already_active')
    || text.includes('appointment_reassignment_after_order_open')
  ) return new BusinessApiError('decision_invalid_transition');
  if (
    text.includes('replacement_professional_not_linked')
    || text.includes('replacement_professional_not_qualified')
    || text.includes('replacement_professional_unavailable')
    || text.includes('replacement_must_change_professional')
  ) return new BusinessApiError('decision_candidate_unavailable');

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
  const diagnosticCode = remoteErrorCode(error);
  return new BusinessApiError(
    genericCodeFor(operation),
    diagnosticCode ? `REMOTE_${diagnosticCode}` : null,
  );
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

const isValidDecisionCommand = (input: DecisionCommandInput) => (
  UUID_PATTERN.test(input.reassignmentRequestId)
  && UUID_PATTERN.test(input.requestId)
  && Number.isInteger(input.expectedVersion)
  && input.expectedVersion > 0
);

const isValidReassignmentRequest = (input: ReassignmentRequestInput) => (
  input.appointmentId.trim().length > 0
  && /^[a-z][a-z0-9_]{2,79}$/u.test(input.reasonCode)
  && ['professional', 'reception', 'manager', 'admin', 'owner'].includes(input.responsibility)
  && Number.isFinite(Date.parse(input.dueAt))
  && Number.isFinite(Date.parse(input.expectedAppointmentUpdatedAt))
  && UUID_PATTERN.test(input.requestId)
  && UUID_PATTERN.test(input.correlationId)
);

const invokeDecisionCommand = async (
  nullableClient: SupabaseClient<Database> | null,
  name: DecisionRpcName,
  args: Record<string, unknown>,
): Promise<AppointmentReassignmentMutationReceipt> => {
  const client = requireClient(nullableClient);
  const caller = client.rpc.bind(client) as unknown as DecisionRpcCaller;
  let result: RpcResult;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  try {
    const timeout = new Promise<never>((_resolve, reject) => {
      timeoutId = setTimeout(() => reject(new Error('network_timeout')), DECISION_RPC_TIMEOUT_MS);
    });
    result = await Promise.race([Promise.resolve(caller(name, args)), timeout]);
  } catch (error) {
    throw translateRpcError('decisions', error);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
  if (result.error) throw translateRpcError('decisions', result.error);
  const receipt = mapAppointmentReassignmentMutationReceipt(result.data);
  if (!receipt) throw new BusinessApiError('invalid_response');
  return receipt;
};

export const createBusinessApi = (
  nullableClient: SupabaseClient<Database> | null,
): BusinessApi => ({
  async getAuthorizedContexts() {
    const client = requireClient(nullableClient);
    let result: RpcResult;
    try {
      result = await invokeRpc(client, 'get_my_authorized_contexts', {
        target_app_id: 'business',
      });
    } catch (error) {
      throw translateRpcError('contexts', error);
    }
    if (result.error) throw translateRpcError('contexts', result.error);

    const rows = asRows(result.data);
    if (!rows) throw new BusinessApiError('invalid_response', 'AUTHORIZED_CONTEXTS_SHAPE');
    const contexts = rows.flatMap((row) => {
      const context = mapAuthorizedContext(row);
      return context ? [context] : [];
    });
    if (contexts.length !== rows.length) {
      throw new BusinessApiError('invalid_response', 'AUTHORIZED_CONTEXTS_ROW');
    }
    return contexts;
  },

  async setActiveEstablishmentContext({ establishmentId, requestId }) {
    if (!UUID_PATTERN.test(establishmentId) || !UUID_PATTERN.test(requestId)) {
      throw new BusinessApiError('invalid_request');
    }
    const client = requireClient(nullableClient);
    let result: RpcResult;
    try {
      result = await invokeRpc(client, 'set_my_active_context', {
        target_app_id: 'business',
        target_context_kind: 'establishment',
        target_establishment_id: establishmentId,
        target_organization_id: null,
        target_request_id: requestId,
      });
    } catch (error) {
      throw translateRpcError('contexts', error);
    }
    if (result.error) throw translateRpcError('contexts', result.error);

    const receipt = mapActiveContextReceipt(result.data);
    if (!receipt) throw new BusinessApiError('invalid_response');
    return receipt;
  },

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
    if (!rows) throw new BusinessApiError('invalid_response', 'OPERATIONAL_CONTEXTS_SHAPE');
    const contexts = rows.flatMap((row) => {
      const context = mapBusinessOperationalContext(row);
      return context ? [context] : [];
    });
    if (contexts.length !== rows.length) {
      throw new BusinessApiError('invalid_response', 'OPERATIONAL_CONTEXTS_ROW');
    }
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

  async listDecisionQueue(establishmentId) {
    if (!UUID_PATTERN.test(establishmentId)) throw new BusinessApiError('invalid_request');
    const client = requireClient(nullableClient);
    let result: RpcResult;
    try {
      result = await invokeRpc(client, 'list_business_decision_queue', {
        target_establishment_id: establishmentId,
      });
    } catch (error) {
      throw translateRpcError('decisions', error);
    }
    if (result.error) throw translateRpcError('decisions', result.error);
    const rows = asRows(result.data);
    if (!rows) throw new BusinessApiError('invalid_response');
    const decisions = rows.map(mapDecisionQueueItem);
    if (decisions.some((item) => item === null)) {
      throw new BusinessApiError('invalid_response');
    }
    return decisions as DecisionQueueItem[];
  },

  async getReassignmentDetail(establishmentId, reassignmentRequestId) {
    if (!UUID_PATTERN.test(establishmentId) || !UUID_PATTERN.test(reassignmentRequestId)) {
      throw new BusinessApiError('invalid_request');
    }
    const client = requireClient(nullableClient);
    let result: RpcResult;
    try {
      result = await invokeRpc(client, 'get_business_reassignment_detail', {
        target_establishment_id: establishmentId,
        target_reassignment_request_id: reassignmentRequestId,
      });
    } catch (error) {
      throw translateRpcError('decisions', error);
    }
    if (result.error) throw translateRpcError('decisions', result.error);
    const detail = mapBusinessReassignmentDetail(result.data);
    if (!detail) throw new BusinessApiError('invalid_response');
    return detail;
  },

  async listReassignmentCandidates(establishmentId, reassignmentRequestId) {
    if (!UUID_PATTERN.test(establishmentId) || !UUID_PATTERN.test(reassignmentRequestId)) {
      throw new BusinessApiError('invalid_request');
    }
    const client = requireClient(nullableClient);
    let result: RpcResult;
    try {
      result = await invokeRpc(client, 'list_business_reassignment_candidates', {
        target_establishment_id: establishmentId,
        target_reassignment_request_id: reassignmentRequestId,
      });
    } catch (error) {
      throw translateRpcError('decisions', error);
    }
    if (result.error) throw translateRpcError('decisions', result.error);
    const rows = asRows(result.data);
    if (!rows) throw new BusinessApiError('invalid_response');
    const candidates = rows.map(mapBusinessReassignmentCandidate);
    if (candidates.some((candidate) => candidate === null)) {
      throw new BusinessApiError('invalid_response');
    }
    return candidates as BusinessReassignmentCandidate[];
  },

  async requestReassignment(input) {
    if (!isValidReassignmentRequest(input)) throw new BusinessApiError('invalid_request');
    return invokeDecisionCommand(nullableClient, 'request_appointment_reassignment', {
      target_appointment_id: input.appointmentId.trim(),
      target_reason_code: input.reasonCode,
      target_responsibility: input.responsibility,
      target_due_at: input.dueAt,
      target_expected_appointment_updated_at: input.expectedAppointmentUpdatedAt,
      target_request_id: input.requestId,
      target_correlation_id: input.correlationId,
    });
  },

  async validateReassignment(input) {
    if (!isValidDecisionCommand(input)) throw new BusinessApiError('invalid_request');
    return invokeDecisionCommand(nullableClient, 'validate_appointment_reassignment', {
      target_reassignment_request_id: input.reassignmentRequestId,
      target_expected_version: input.expectedVersion,
      target_request_id: input.requestId,
    });
  },

  async proposeReassignment(input) {
    if (!isValidDecisionCommand(input) || !UUID_PATTERN.test(input.professionalId)) {
      throw new BusinessApiError('invalid_request');
    }
    return invokeDecisionCommand(nullableClient, 'propose_appointment_reassignment', {
      target_reassignment_request_id: input.reassignmentRequestId,
      target_proposed_professional_id: input.professionalId,
      target_expected_version: input.expectedVersion,
      target_request_id: input.requestId,
    });
  },

  async applyReassignment(input) {
    if (!isValidDecisionCommand(input)) throw new BusinessApiError('invalid_request');
    return invokeDecisionCommand(nullableClient, 'apply_appointment_reassignment', {
      target_reassignment_request_id: input.reassignmentRequestId,
      target_expected_version: input.expectedVersion,
      target_request_id: input.requestId,
    });
  },

  async withdrawReassignment(input) {
    if (
      !isValidDecisionCommand(input)
      || input.reason.trim().length < 3
      || input.reason.trim().length > 500
    ) throw new BusinessApiError('invalid_request');
    return invokeDecisionCommand(nullableClient, 'withdraw_appointment_reassignment', {
      target_reassignment_request_id: input.reassignmentRequestId,
      target_expected_version: input.expectedVersion,
      target_reason: input.reason.trim(),
      target_request_id: input.requestId,
    });
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

  async closeServiceOrder(input) {
    const client = requireClient(nullableClient);
    try {
      return await createServiceOrderApi(client).closeServiceOrder(input);
    } catch (error) {
      throw translateRpcError('service_order', error);
    }
  },

  async listPaymentMethods(establishmentId) {
    const client = requireClient(nullableClient);
    try {
      return await createManualPosApi(client).listPaymentMethods(establishmentId);
    } catch (error) {
      throw translateRpcError('manual_pos', error);
    }
  },

  async getPaymentSummary(establishmentId, serviceOrderId) {
    const client = requireClient(nullableClient);
    try {
      return await createManualPosApi(client).getPaymentSummary(establishmentId, serviceOrderId);
    } catch (error) {
      throw translateRpcError('manual_pos', error);
    }
  },

  async recordPayment(input) {
    const client = requireClient(nullableClient);
    try {
      return await createManualPosApi(client).recordPayment(input);
    } catch (error) {
      throw translateRpcError('manual_pos', error);
    }
  },

  async voidPayment(input) {
    const client = requireClient(nullableClient);
    try {
      return await createManualPosApi(client).voidPayment(input);
    } catch (error) {
      throw translateRpcError('manual_pos', error);
    }
  },

  async inspectInvitation(token) {
    const invitationToken = requireToken(token);
    const client = requireClient(nullableClient);
    let result: RpcResult;
    try {
      result = await invokeRpc(client, 'inspect_invitation', {
        invitation_token: invitationToken,
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

  async acceptInvitation(token) {
    const invitationToken = requireToken(token);
    const client = requireClient(nullableClient);
    let result: RpcResult;
    try {
      result = await invokeRpc(client, 'accept_invitation', {
        invitation_token: invitationToken,
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
