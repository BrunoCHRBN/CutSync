import type { MobileSyncStatus } from '@cutsync/database';

const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 20;
const MAX_SAFE_CENTS = Number.MAX_SAFE_INTEGER;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export type BusinessPosPersistedStatus = Extract<
  MobileSyncStatus,
  'syncing' | 'offline_pending' | 'manual_review'
>;

interface BusinessPosCommandBase {
  userId: string;
  establishmentId: string;
  serviceOrderId: string;
  expectedVersion: number;
  requestId: string;
}

export type BusinessPosCommandInput =
  | (BusinessPosCommandBase & {
    kind: 'record_payment';
    paymentMethodId: string;
    amountCents: number;
    externalReference: string | null;
  })
  | (BusinessPosCommandBase & {
    kind: 'void_payment';
    paymentEntryId: string;
    reason: string;
  })
  | (BusinessPosCommandBase & {
    kind: 'close_service_order';
  });

export type BusinessPosOutboxEntry = BusinessPosCommandInput & {
  version: 1;
  status: BusinessPosPersistedStatus;
  attempts: number;
  createdAt: string;
  updatedAt: string;
  lastError: string | null;
};

export const businessPosOutboxKey = (userId: string) => (
  `cutsync.business.pos-outbox.v1.${userId}`
);

const isTimestamp = (value: unknown): value is string => (
  typeof value === 'string' && Number.isFinite(Date.parse(value))
);

const isSafeVersion = (value: unknown): value is number => (
  Number.isSafeInteger(value) && Number(value) >= 1
);

const hasValidBase = (
  entry: Partial<BusinessPosOutboxEntry>,
  userId: string,
  now: number,
) => entry.version === 1
  && entry.userId === userId
  && UUID_PATTERN.test(entry.userId ?? '')
  && UUID_PATTERN.test(entry.establishmentId ?? '')
  && UUID_PATTERN.test(entry.serviceOrderId ?? '')
  && UUID_PATTERN.test(entry.requestId ?? '')
  && isSafeVersion(entry.expectedVersion)
  && ['syncing', 'offline_pending', 'manual_review'].includes(entry.status ?? '')
  && Number.isSafeInteger(entry.attempts)
  && Number(entry.attempts) >= 0
  && isTimestamp(entry.createdAt)
  && isTimestamp(entry.updatedAt)
  && now - Date.parse(entry.createdAt ?? '') <= MAX_AGE_MS
  && Date.parse(entry.createdAt ?? '') <= now + 5 * 60 * 1000
  && (entry.lastError === null || (
    typeof entry.lastError === 'string' && entry.lastError.length <= 500
  ));

const hasValidPayload = (entry: Partial<BusinessPosOutboxEntry>) => {
  if (entry.kind === 'record_payment') {
    return UUID_PATTERN.test(entry.paymentMethodId ?? '')
      && Number.isSafeInteger(entry.amountCents)
      && Number(entry.amountCents) > 0
      && Number(entry.amountCents) <= MAX_SAFE_CENTS
      && (entry.externalReference === null || (
        typeof entry.externalReference === 'string'
        && entry.externalReference.length >= 1
        && entry.externalReference.length <= 120
      ));
  }
  if (entry.kind === 'void_payment') {
    return UUID_PATTERN.test(entry.paymentEntryId ?? '')
      && typeof entry.reason === 'string'
      && entry.reason.length >= 3
      && entry.reason.length <= 500;
  }
  return entry.kind === 'close_service_order';
};

const isEntry = (
  value: unknown,
  userId: string,
  now: number,
): value is BusinessPosOutboxEntry => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const entry = value as Partial<BusinessPosOutboxEntry>;
  return hasValidBase(entry, userId, now) && hasValidPayload(entry);
};

export const decodeBusinessPosOutbox = (
  raw: string,
  userId: string,
  now = Date.now(),
): BusinessPosOutboxEntry[] | null => {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((entry): entry is BusinessPosOutboxEntry => (
      isEntry(entry, userId, now)
    )).slice(-MAX_ENTRIES);
  } catch {
    return null;
  }
};

export const encodeBusinessPosOutbox = (entries: BusinessPosOutboxEntry[]) => (
  JSON.stringify(entries.slice(-MAX_ENTRIES))
);
