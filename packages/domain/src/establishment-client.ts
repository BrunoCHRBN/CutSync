export const ESTABLISHMENT_CLIENT_SOURCES = [
  'manual',
  'walk_in',
  'client_booking',
  'import',
] as const;

export type EstablishmentClientSource = (typeof ESTABLISHMENT_CLIENT_SOURCES)[number];

export const ESTABLISHMENT_CLIENT_STATUSES = ['active', 'archived', 'merged'] as const;

export type EstablishmentClientStatus = (typeof ESTABLISHMENT_CLIENT_STATUSES)[number];

export const ESTABLISHMENT_CLIENT_CONSENT_STATUSES = ['unknown', 'granted', 'revoked'] as const;

export type EstablishmentClientConsentStatus =
  (typeof ESTABLISHMENT_CLIENT_CONSENT_STATUSES)[number];

const STATUS_TRANSITIONS: Record<EstablishmentClientStatus, readonly EstablishmentClientStatus[]> = {
  active: ['archived', 'merged'],
  archived: ['active'],
  merged: [],
};

export const isEstablishmentClientSource = (value: unknown): value is EstablishmentClientSource => (
  typeof value === 'string'
  && (ESTABLISHMENT_CLIENT_SOURCES as readonly string[]).includes(value)
);

export const isEstablishmentClientStatus = (value: unknown): value is EstablishmentClientStatus => (
  typeof value === 'string'
  && (ESTABLISHMENT_CLIENT_STATUSES as readonly string[]).includes(value)
);

export const isEstablishmentClientConsentStatus = (
  value: unknown,
): value is EstablishmentClientConsentStatus => (
  typeof value === 'string'
  && (ESTABLISHMENT_CLIENT_CONSENT_STATUSES as readonly string[]).includes(value)
);

/**
 * A merged row is terminal: it only survives as a pointer to the survivor, so
 * no transition can bring it back.
 */
export const canTransitionEstablishmentClient = (
  from: EstablishmentClientStatus,
  to: EstablishmentClientStatus,
) => STATUS_TRANSITIONS[from].includes(to);

/**
 * Merging keeps the most restrictive consent of the two rows. A `granted`
 * consent proven on one row does not extend to contacts that arrived through
 * the other one, so `unknown` outranks `granted` and `revoked` outranks both.
 */
export const resolveMergedConsentStatus = (
  survivor: EstablishmentClientConsentStatus,
  duplicate: EstablishmentClientConsentStatus,
): EstablishmentClientConsentStatus => {
  if (survivor === 'revoked' || duplicate === 'revoked') return 'revoked';
  if (survivor === 'unknown' || duplicate === 'unknown') return 'unknown';
  return 'granted';
};

/**
 * Imported rows never carry marketing consent from the source platform unless
 * the establishment provides evidence, which is a separate manual decision.
 */
export const isMarketingReachable = (
  status: EstablishmentClientConsentStatus,
) => status === 'granted';

export const ESTABLISHMENT_CLIENT_ERROR_CODES = [
  'establishment_client_not_found',
  'establishment_client_archived',
  'establishment_client_merged',
  'establishment_client_has_future_appointments',
  'establishment_client_tenant_mismatch',
  'invalid_client_name',
  'invalid_client_phone',
  'invalid_client_email',
  'invalid_client_tags',
  'invalid_client_source',
  'invalid_client_consent_status',
  'client_notes_too_long',
  'merge_requires_distinct_clients',
  'merge_link_conflict',
  'merge_reason_too_long',
  'duplicate_external_client',
] as const;

export type EstablishmentClientErrorCode = (typeof ESTABLISHMENT_CLIENT_ERROR_CODES)[number];

const ERROR_MESSAGES: Record<EstablishmentClientErrorCode, string> = {
  establishment_client_not_found: 'Cliente não encontrado neste estabelecimento.',
  establishment_client_archived: 'Este cliente está arquivado. Restaure antes de editar.',
  establishment_client_merged: 'Este cliente foi unificado com outro registro.',
  establishment_client_has_future_appointments:
    'Este cliente tem agendamentos futuros. Cancele ou conclua antes de arquivar.',
  establishment_client_tenant_mismatch: 'Este cliente pertence a outro estabelecimento.',
  invalid_client_name: 'Informe um nome entre 2 e 120 caracteres.',
  invalid_client_phone: 'Informe um telefone válido.',
  invalid_client_email: 'Informe um e-mail válido.',
  invalid_client_tags: 'Revise as etiquetas do cliente.',
  invalid_client_source: 'Origem de cliente inválida.',
  invalid_client_consent_status: 'Estado de consentimento inválido.',
  client_notes_too_long: 'Reduza as observações para até 2000 caracteres.',
  merge_requires_distinct_clients: 'Selecione dois clientes diferentes para unificar.',
  merge_link_conflict: 'Os clientes estão vinculados a contas diferentes e não podem ser unificados.',
  merge_reason_too_long: 'Reduza o motivo da unificação.',
  duplicate_external_client: 'Este registro já foi importado anteriormente.',
};

export const isEstablishmentClientErrorCode = (
  value: unknown,
): value is EstablishmentClientErrorCode => (
  typeof value === 'string'
  && (ESTABLISHMENT_CLIENT_ERROR_CODES as readonly string[]).includes(value)
);

export const translateEstablishmentClientError = (
  error: unknown,
  fallback = 'Não foi possível concluir a operação com o cliente.',
) => {
  const raw = typeof error === 'string'
    ? error
    : (error as { message?: unknown } | null)?.message;
  if (typeof raw !== 'string') return fallback;
  const match = ESTABLISHMENT_CLIENT_ERROR_CODES.find((code) => raw.includes(code));
  return match ? ERROR_MESSAGES[match] : fallback;
};
