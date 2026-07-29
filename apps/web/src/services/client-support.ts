import {
  createSupportIdempotencyKey,
  isSupportCategory,
  isSupportImpact,
  isSupportMessageAuthor,
  isSupportPriority,
  isSupportRequestKind,
  isSupportSyncStatus,
  isSupportTicketStatus,
  type SupportCategory,
  type SupportImpact,
  type SupportMessageAuthor,
  type SupportPriority,
  type SupportRequestKind,
  type SupportSyncStatus,
  type SupportTicketStatus,
} from '@cutsync/domain';

import { supabase } from './supabase';

type UnknownRecord = Record<string, unknown>;
type RpcResult = {
  data: unknown;
  error: { code?: string; message?: string; details?: string } | null;
};
type RpcInvoker = (
  functionName: string,
  args?: Record<string, unknown>,
) => Promise<RpcResult>;

export interface ClientSupportCapabilities {
  enabled: boolean;
  allowNewTickets: boolean;
  syncEnabled: boolean;
  maintenanceMessage: string | null;
}

export interface ClientSupportTicket {
  id: string;
  protocol: string;
  subject: string;
  requestKind: SupportRequestKind;
  category: SupportCategory;
  impact: SupportImpact;
  priority: SupportPriority;
  status: SupportTicketStatus;
  syncStatus: SupportSyncStatus;
  assigneeName: string | null;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string;
}

export interface ClientSupportMessage {
  id: string;
  ticketId: string;
  authorKind: SupportMessageAuthor;
  body: string;
  createdAt: string;
}

export interface ClientSupportTicketDetail {
  ticket: ClientSupportTicket;
  messages: ClientSupportMessage[];
}

export interface CreateClientSupportTicketInput {
  category: SupportCategory;
  impact: SupportImpact;
  subject: string;
  message: string;
  appointmentId?: string | null;
  idempotencyKey: string;
}

const asRecord = (value: unknown): UnknownRecord | null => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as UnknownRecord
    : null
);

const asString = (value: unknown) => (
  typeof value === 'string' && value.trim() ? value.trim() : null
);

const asBoolean = (value: unknown, fallback = false) => (
  typeof value === 'boolean' ? value : fallback
);

const readValue = (record: UnknownRecord, ...keys: string[]) => {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) return record[key];
  }
  return undefined;
};

const firstRecord = (value: unknown): UnknownRecord | null => {
  if (Array.isArray(value)) return asRecord(value[0]);
  return asRecord(value);
};

const invokeRpc = (name: string, args?: Record<string, unknown>) => (
  (supabase.rpc as unknown as RpcInvoker)(name, args)
);

const mapTicket = (value: unknown): ClientSupportTicket | null => {
  const record = asRecord(value);
  if (!record) return null;

  const id = asString(readValue(record, 'id', 'ticket_id'));
  const subject = asString(readValue(record, 'subject', 'title'));
  const createdAt = asString(readValue(record, 'created_at', 'createdAt'));
  if (!id || !subject || !createdAt) return null;

  const categoryValue = asString(readValue(record, 'category', 'area')) ?? '';
  const requestKindValue = asString(readValue(record, 'request_kind', 'requestKind')) ?? '';
  const impactValue = asString(record.impact) ?? '';
  const priorityValue = asString(record.priority) ?? '';
  const statusValue = asString(readValue(record, 'status', 'ticket_status')) ?? '';
  const externalKey = asString(readValue(record, 'jsm_issue_key', 'external_key', 'jira_key'));
  const syncValue = asString(readValue(record, 'sync_status', 'syncStatus')) ?? '';
  const status = isSupportTicketStatus(statusValue) ? statusValue : 'queued';
  const updatedAt = asString(readValue(record, 'updated_at', 'updatedAt')) ?? createdAt;

  return {
    id,
    protocol: asString(
      readValue(record, 'protocol', 'public_protocol', 'ticket_number'),
    ) ?? externalKey ?? id,
    subject,
    requestKind: isSupportRequestKind(requestKindValue) ? requestKindValue : 'incident',
    category: isSupportCategory(categoryValue) ? categoryValue : 'other',
    impact: isSupportImpact(impactValue) ? impactValue : 'normal',
    priority: isSupportPriority(priorityValue) ? priorityValue : 'normal',
    status,
    syncStatus: isSupportSyncStatus(syncValue)
      ? syncValue
      : status === 'sync_failed'
        ? 'failed'
        : externalKey
          ? 'synced'
          : 'pending',
    assigneeName: asString(readValue(
      record,
      'assignee_display_name',
      'assignee_name',
      'assigned_to_name',
    )),
    createdAt,
    updatedAt,
    lastMessageAt: asString(
      readValue(record, 'last_message_at', 'lastMessageAt'),
    ) ?? updatedAt,
  };
};

const mapMessage = (value: unknown): ClientSupportMessage | null => {
  const record = asRecord(value);
  if (!record) return null;

  const id = asString(readValue(record, 'id', 'message_id'));
  const ticketId = asString(readValue(record, 'ticket_id', 'ticketId'));
  const body = asString(readValue(record, 'body', 'message', 'content'));
  const createdAt = asString(readValue(record, 'created_at', 'createdAt'));
  if (!id || !ticketId || !body || !createdAt) return null;

  const authorValue = asString(
    readValue(record, 'author_kind', 'author_type', 'author'),
  ) ?? '';
  const authorKind = isSupportMessageAuthor(authorValue)
    ? authorValue
    : ['agent', 'team', 'operator'].includes(authorValue)
      ? 'support'
      : ['user', 'client'].includes(authorValue)
        ? 'requester'
        : 'system';

  return { id, ticketId, body, createdAt, authorKind };
};

const errorText = (error: unknown) => {
  const record = asRecord(error);
  return [
    asString(record?.code),
    asString(record?.message),
    asString(record?.details),
  ].filter(Boolean).join(' ').toLowerCase();
};

const readFunctionErrorText = async (error: unknown) => {
  const base = errorText(error);
  const context = asRecord(error)?.context;
  if (typeof Response === 'undefined' || !(context instanceof Response)) return base;

  try {
    const payload = await context.clone().json();
    return `${base} ${errorText(payload)}`.trim();
  } catch {
    return base;
  }
};

const supportErrorMessage = (text: string, fallback: string) => {
  if (
    text.includes('authentication_required')
    || text.includes('invalid_jwt')
    || text.includes('unauthorized')
  ) return 'Entre novamente para continuar.';
  if (text.includes('support_disabled')) {
    return 'A Central de Suporte está temporariamente indisponível.';
  }
  if (text.includes('new_tickets_disabled')) {
    return 'Novos chamados estão pausados no momento.';
  }
  if (text.includes('not_found')) return 'Este chamado não foi encontrado na sua conta.';
  if (text.includes('ticket_closed')) {
    return 'Este chamado já foi encerrado. Abra um novo chamado para continuar.';
  }
  if (text.includes('forbidden')) return 'Você não tem acesso a este chamado.';
  if (text.includes('429') || text.includes('rate_limit')) {
    return 'Muitas solicitações foram enviadas. Aguarde alguns minutos.';
  }
  if (text.includes('invalid_') || text.includes('validation')) {
    return 'Revise os dados informados e tente novamente.';
  }
  if (
    text.includes('network')
    || text.includes('fetch')
    || text.includes('failed to send')
  ) return 'Não foi possível conectar. Verifique sua internet e tente novamente.';
  return fallback;
};

export const createClientSupportIdempotencyKey = () => createSupportIdempotencyKey();

export const loadClientSupportCapabilities = async (): Promise<ClientSupportCapabilities> => {
  const { data, error } = await invokeRpc('get_support_capabilities');
  if (error) {
    throw new Error(supportErrorMessage(
      errorText(error),
      'Não foi possível consultar a disponibilidade do suporte.',
    ));
  }

  const wrapper = firstRecord(data);
  const record = firstRecord(wrapper?.capabilities ?? data);
  if (!record) {
    return {
      enabled: false,
      allowNewTickets: false,
      syncEnabled: false,
      maintenanceMessage: 'A Central de Suporte está temporariamente indisponível.',
    };
  }

  const enabled = asBoolean(readValue(record, 'enabled', 'is_enabled'));
  return {
    enabled,
    allowNewTickets: enabled && asBoolean(
      readValue(record, 'allow_new_tickets', 'allowNewTickets'),
    ),
    syncEnabled: enabled && asBoolean(readValue(record, 'sync_enabled', 'syncEnabled')),
    maintenanceMessage: asString(
      readValue(record, 'maintenance_message', 'maintenanceMessage'),
    ),
  };
};

export const listClientSupportTickets = async (): Promise<ClientSupportTicket[]> => {
  const { data, error } = await invokeRpc('list_my_support_tickets');
  if (error) {
    throw new Error(supportErrorMessage(
      errorText(error),
      'Não foi possível carregar seus chamados.',
    ));
  }

  const wrapper = firstRecord(data);
  const rows = Array.isArray(data)
    ? data
    : Array.isArray(wrapper?.tickets)
      ? wrapper.tickets
      : [];

  return rows
    .map(mapTicket)
    .filter((ticket): ticket is ClientSupportTicket => Boolean(ticket))
    .sort((left, right) => (
      new Date(right.lastMessageAt).getTime() - new Date(left.lastMessageAt).getTime()
    ));
};

export const loadClientSupportTicket = async (
  ticketId: string,
): Promise<ClientSupportTicketDetail | null> => {
  const { data, error } = await invokeRpc('get_my_support_ticket', {
    target_ticket_id: ticketId,
  });
  if (error) {
    const text = errorText(error);
    if (text.includes('not_found')) return null;
    throw new Error(supportErrorMessage(text, 'Não foi possível carregar este chamado.'));
  }

  const wrapper = firstRecord(data);
  if (!wrapper) return null;
  const ticket = mapTicket(wrapper.ticket ?? wrapper);
  if (!ticket) return null;

  const rows = Array.isArray(wrapper.messages) ? wrapper.messages : [];
  const messages = rows
    .map(mapMessage)
    .filter((message): message is ClientSupportMessage => Boolean(message))
    .sort((left, right) => (
      new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
    ));

  return { ticket, messages };
};

export const createClientSupportTicket = async (
  input: CreateClientSupportTicketInput,
) => {
  const { data, error } = await supabase.functions.invoke<unknown>('create-jsm-ticket', {
    body: {
      requestKind: 'incident',
      category: input.category,
      impact: input.impact,
      subject: input.subject,
      message: input.message,
      appointmentId: input.appointmentId || undefined,
      idempotencyKey: input.idempotencyKey,
    },
  });
  if (error) {
    throw new Error(supportErrorMessage(
      await readFunctionErrorText(error),
      'Não foi possível abrir o chamado agora. Tente novamente.',
    ));
  }

  const wrapper = firstRecord(data);
  const ticket = mapTicket(wrapper?.ticket);
  if (!ticket) {
    throw new Error('O chamado foi recebido, mas a confirmação não pôde ser carregada.');
  }
  return ticket;
};

export const replyClientSupportTicket = async ({
  ticketId,
  message,
  idempotencyKey,
}: {
  ticketId: string;
  message: string;
  idempotencyKey: string;
}) => {
  const { error } = await supabase.functions.invoke<unknown>('reply-jsm-ticket', {
    body: { ticketId, message, idempotencyKey },
  });
  if (error) {
    throw new Error(supportErrorMessage(
      await readFunctionErrorText(error),
      'Não foi possível enviar sua resposta agora.',
    ));
  }
};
