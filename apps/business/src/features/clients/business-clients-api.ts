import {
  mapEstablishmentClient,
  mapEstablishmentClientDetail,
  type EstablishmentClient,
  type EstablishmentClientConsentStatus,
  type EstablishmentClientDetail,
} from '@cutsync/database';

import {
  assertUuid,
  BusinessFeatureError,
  callBusinessRpc,
} from '@/features/connectivity/business-rpc';

export type { EstablishmentClientDetail };

export interface EstablishmentClientValues {
  name: string;
  phone?: string | null;
  email?: string | null;
  tags?: string[];
  notes?: string | null;
  marketingConsentStatus?: EstablishmentClientConsentStatus;
}

const clean = (value?: string | null) => value?.trim() || null;

const list = (value: unknown) => {
  if (!Array.isArray(value)) throw new BusinessFeatureError('invalid_response');
  return value;
};

const detailFrom = (value: unknown): EstablishmentClientDetail => {
  const detail = mapEstablishmentClientDetail(value);
  if (!detail) throw new BusinessFeatureError('invalid_response');
  return detail;
};

const requireName = (value: string) => {
  const name = value.trim();
  if (name.length < 2 || name.length > 120) throw new BusinessFeatureError('invalid_request');
  return name;
};

const valuesArgs = (values: EstablishmentClientValues) => ({
  target_name: requireName(values.name),
  target_phone: clean(values.phone),
  target_email: clean(values.email)?.toLowerCase() ?? null,
  target_tags: [...new Set((values.tags ?? []).map((tag) => tag.trim()).filter(Boolean))],
  target_notes: clean(values.notes),
});

export const businessClientsApi = {
  async search(
    establishmentId: string,
    query = '',
    options?: { includeArchived?: boolean },
  ): Promise<EstablishmentClient[]> {
    const data = await callBusinessRpc('search_establishment_clients', {
      target_establishment_id: assertUuid(establishmentId),
      target_query: clean(query),
      target_include_archived: options?.includeArchived ?? false,
      target_limit: 50,
      target_offset: 0,
    });
    const rows = list(data);
    const clients = rows.flatMap((row) => {
      const client = mapEstablishmentClient(row);
      return client ? [client] : [];
    });
    if (clients.length !== rows.length) throw new BusinessFeatureError('invalid_response');
    return clients;
  },

  async get(establishmentId: string, clientId: string) {
    const data = await callBusinessRpc('get_establishment_client', {
      target_establishment_id: assertUuid(establishmentId),
      target_establishment_client_id: assertUuid(clientId),
    });
    return detailFrom(data);
  },

  async create(establishmentId: string, requestId: string, values: EstablishmentClientValues) {
    return callBusinessRpc('create_establishment_client', {
      target_establishment_id: assertUuid(establishmentId),
      target_request_id: assertUuid(requestId),
      ...valuesArgs(values),
    });
  },

  async update(
    establishmentId: string,
    clientId: string,
    requestId: string,
    values: EstablishmentClientValues,
  ) {
    return callBusinessRpc('update_establishment_client', {
      target_establishment_id: assertUuid(establishmentId),
      target_establishment_client_id: assertUuid(clientId),
      target_request_id: assertUuid(requestId),
      ...valuesArgs(values),
      ...(values.marketingConsentStatus
        ? { target_marketing_consent_status: values.marketingConsentStatus }
        : {}),
    });
  },

  async archive(establishmentId: string, clientId: string, requestId: string) {
    return callBusinessRpc('archive_establishment_client', {
      target_establishment_id: assertUuid(establishmentId),
      target_establishment_client_id: assertUuid(clientId),
      target_request_id: assertUuid(requestId),
    });
  },

  async restore(establishmentId: string, clientId: string, requestId: string) {
    return callBusinessRpc('restore_establishment_client', {
      target_establishment_id: assertUuid(establishmentId),
      target_establishment_client_id: assertUuid(clientId),
      target_request_id: assertUuid(requestId),
    });
  },

  async merge(input: {
    establishmentId: string;
    survivorClientId: string;
    duplicateClientId: string;
    requestId: string;
    reason?: string | null;
  }) {
    return callBusinessRpc('merge_establishment_clients', {
      target_establishment_id: assertUuid(input.establishmentId),
      target_survivor_client_id: assertUuid(input.survivorClientId),
      target_duplicate_client_id: assertUuid(input.duplicateClientId),
      target_request_id: assertUuid(input.requestId),
      target_reason: clean(input.reason),
    });
  },
};
