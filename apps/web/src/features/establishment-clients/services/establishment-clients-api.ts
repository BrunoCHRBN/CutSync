import {
  mapEstablishmentClient,
  mapEstablishmentClientDetail,
  type EstablishmentClient,
  type EstablishmentClientConsentStatus,
  type EstablishmentClientDetail,
} from '@cutsync/database';
import { translateEstablishmentClientError } from '@cutsync/domain';

import { supabase } from '../../../services/supabase';

export class EstablishmentClientApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EstablishmentClientApiError';
  }
}

export interface EstablishmentClientWriteValues {
  name: string;
  phone?: string | null;
  email?: string | null;
  tags?: string[];
  notes?: string | null;
  marketingConsentStatus?: EstablishmentClientConsentStatus;
}

const clean = (value?: string | null) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

const throwRpcError = (error: { message?: string } | null) => {
  throw new EstablishmentClientApiError(
    translateEstablishmentClientError(error, error?.message || 'Não foi possível concluir a operação.'),
  );
};

const requireList = (value: unknown): unknown[] => {
  if (!Array.isArray(value)) {
    throw new EstablishmentClientApiError('Resposta inválida ao listar clientes.');
  }
  return value;
};

const baseValuesArgs = (values: EstablishmentClientWriteValues) => ({
  target_name: values.name.trim(),
  target_phone: clean(values.phone),
  target_email: clean(values.email)?.toLowerCase(),
  target_tags: [...new Set((values.tags ?? []).map((tag) => tag.trim()).filter(Boolean))],
  target_notes: clean(values.notes),
});

export const establishmentClientsApi = {
  async search(input: {
    establishmentId: string;
    query?: string;
    includeArchived?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<EstablishmentClient[]> {
    const { data, error } = await supabase.rpc('search_establishment_clients', {
      target_establishment_id: input.establishmentId,
      target_query: clean(input.query),
      target_include_archived: input.includeArchived ?? false,
      target_limit: input.limit ?? 50,
      target_offset: input.offset ?? 0,
    });
    if (error) throwRpcError(error);
    const rows = requireList(data);
    const clients = rows.flatMap((row) => {
      const client = mapEstablishmentClient(row);
      return client ? [client] : [];
    });
    if (clients.length !== rows.length) {
      throw new EstablishmentClientApiError('Resposta inválida ao listar clientes.');
    }
    return clients;
  },

  async get(establishmentId: string, clientId: string): Promise<EstablishmentClientDetail> {
    const { data, error } = await supabase.rpc('get_establishment_client', {
      target_establishment_id: establishmentId,
      target_establishment_client_id: clientId,
    });
    if (error) throwRpcError(error);
    const detail = mapEstablishmentClientDetail(data);
    if (!detail) {
      throw new EstablishmentClientApiError('Resposta inválida ao carregar o cliente.');
    }
    return detail;
  },

  async create(
    establishmentId: string,
    requestId: string,
    values: EstablishmentClientWriteValues,
  ) {
    const { data, error } = await supabase.rpc('create_establishment_client', {
      target_establishment_id: establishmentId,
      target_request_id: requestId,
      ...baseValuesArgs(values),
    });
    if (error) throwRpcError(error);
    return data;
  },

  async update(
    establishmentId: string,
    clientId: string,
    requestId: string,
    values: EstablishmentClientWriteValues,
  ) {
    const { data, error } = await supabase.rpc('update_establishment_client', {
      target_establishment_id: establishmentId,
      target_establishment_client_id: clientId,
      target_request_id: requestId,
      ...baseValuesArgs(values),
      ...(values.marketingConsentStatus
        ? { target_marketing_consent_status: values.marketingConsentStatus }
        : {}),
    });
    if (error) throwRpcError(error);
    return data;
  },

  async archive(establishmentId: string, clientId: string, requestId: string) {
    const { data, error } = await supabase.rpc('archive_establishment_client', {
      target_establishment_id: establishmentId,
      target_establishment_client_id: clientId,
      target_request_id: requestId,
    });
    if (error) throwRpcError(error);
    return data;
  },

  async restore(establishmentId: string, clientId: string, requestId: string) {
    const { data, error } = await supabase.rpc('restore_establishment_client', {
      target_establishment_id: establishmentId,
      target_establishment_client_id: clientId,
      target_request_id: requestId,
    });
    if (error) throwRpcError(error);
    return data;
  },

  async merge(input: {
    establishmentId: string;
    survivorClientId: string;
    duplicateClientId: string;
    requestId: string;
    reason?: string | null;
  }) {
    const { data, error } = await supabase.rpc('merge_establishment_clients', {
      target_establishment_id: input.establishmentId,
      target_survivor_client_id: input.survivorClientId,
      target_duplicate_client_id: input.duplicateClientId,
      target_request_id: input.requestId,
      target_reason: clean(input.reason),
    });
    if (error) throwRpcError(error);
    return data;
  },
};
