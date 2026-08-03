import { createMobileRequestId } from '@cutsync/domain';

export type ClientEstablishmentLinkStatus = 'pending' | 'confirmed' | 'rejected';
export type ClientEstablishmentLinkAction = 'confirm' | 'reject';

export interface ClientEstablishmentLink {
  linkId: string;
  establishmentClientId: string;
  establishmentId: string;
  establishmentName: string;
  clientDisplayName: string;
  matchKind: string;
  status: ClientEstablishmentLinkStatus;
  createdAt: string;
}

export interface ClientEstablishmentLinkMutationResult {
  linkId: string;
  establishmentClientId: string;
  establishmentId: string;
  status: Exclude<ClientEstablishmentLinkStatus, 'pending'>;
}

type UnknownRecord = Record<string, unknown>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const asRecord = (value: unknown): UnknownRecord | null => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as UnknownRecord
    : null
);

const asNonEmptyString = (value: unknown) => (
  typeof value === 'string' && value.trim() ? value.trim() : null
);

const asUuid = (value: unknown) => {
  const candidate = asNonEmptyString(value);
  return candidate && UUID_PATTERN.test(candidate) ? candidate : null;
};

const asTimestamp = (value: unknown) => {
  const candidate = asNonEmptyString(value);
  return candidate && Number.isFinite(Date.parse(candidate)) ? candidate : null;
};

const asStatus = (value: unknown): ClientEstablishmentLinkStatus | null => (
  value === 'pending' || value === 'confirmed' || value === 'rejected'
    ? value
    : null
);

export const isClientEstablishmentLinkId = (value: string) => UUID_PATTERN.test(value);

export const mapClientEstablishmentLink = (value: unknown): ClientEstablishmentLink | null => {
  const record = asRecord(value);
  if (!record) return null;

  const linkId = asUuid(record.linkId);
  const establishmentClientId = asUuid(record.establishmentClientId);
  const establishmentId = asUuid(record.establishmentId);
  const establishmentName = asNonEmptyString(record.establishmentName);
  const clientDisplayName = asNonEmptyString(record.clientDisplayName);
  const matchKind = asNonEmptyString(record.matchKind);
  const status = asStatus(record.status);
  const createdAt = asTimestamp(record.createdAt);

  if (
    !linkId
    || !establishmentClientId
    || !establishmentId
    || !establishmentName
    || !clientDisplayName
    || !matchKind
    || !status
    || !createdAt
  ) return null;

  return {
    linkId,
    establishmentClientId,
    establishmentId,
    establishmentName,
    clientDisplayName,
    matchKind,
    status,
    createdAt,
  };
};

export const mapClientEstablishmentLinks = (value: unknown): ClientEstablishmentLink[] | null => {
  if (!Array.isArray(value)) return null;
  const mapped = value.map(mapClientEstablishmentLink);
  if (mapped.some((item) => item === null)) return null;

  const links = mapped as ClientEstablishmentLink[];
  if (new Set(links.map((item) => item.linkId)).size !== links.length) return null;

  return links.sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
};

export const mapClientEstablishmentLinkMutationResult = (
  value: unknown,
  expectedLinkId: string,
  expectedStatus: 'confirmed' | 'rejected',
): ClientEstablishmentLinkMutationResult | null => {
  const record = asRecord(Array.isArray(value) ? value[0] : value);
  if (!record) return null;

  const linkId = asUuid(record.linkId);
  const establishmentClientId = asUuid(record.establishmentClientId);
  const establishmentId = asUuid(record.establishmentId);
  if (
    linkId !== expectedLinkId
    || !establishmentClientId
    || !establishmentId
    || record.status !== expectedStatus
  ) return null;

  return { linkId, establishmentClientId, establishmentId, status: expectedStatus };
};

export const createClientEstablishmentLinkRequestIdStore = (
  createRequestId: () => string = createMobileRequestId,
) => {
  const requestIds = new Map<string, string>();
  const keyFor = (action: ClientEstablishmentLinkAction, linkId: string) => `${action}:${linkId}`;

  return {
    getOrCreate(action: ClientEstablishmentLinkAction, linkId: string) {
      const key = keyFor(action, linkId);
      const existing = requestIds.get(key);
      if (existing) return existing;
      const requestId = createRequestId();
      requestIds.set(key, requestId);
      return requestId;
    },
    complete(action: ClientEstablishmentLinkAction, linkId: string) {
      requestIds.delete(keyFor(action, linkId));
    },
  };
};
