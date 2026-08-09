import type {
  ClientReassignmentAction,
  MobileSyncStatus,
} from './appointment-reassignment';

const OUTBOX_VERSION = 1;
const MAX_ENTRIES = 20;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ClientReassignmentPersistedSyncStatus = Extract<
  MobileSyncStatus,
  'syncing' | 'offline_pending' | 'manual_review'
>;

export interface ClientReassignmentOutboxEntry {
  version: 1;
  userId: string;
  appointmentId: string;
  reassignmentRequestId: string;
  decision: ClientReassignmentAction;
  chosenProfessionalId: string | null;
  expectedVersion: number;
  requestId: string;
  correlationId: string;
  status: ClientReassignmentPersistedSyncStatus;
  attempts: number;
  createdAt: string;
  updatedAt: string;
  lastError: string | null;
}

export const clientReassignmentOutboxKey = (userId: string) => (
  `cutsync.client.reassignment-outbox.v1.${userId}`
);

const isIsoTimestamp = (value: unknown): value is string => (
  typeof value === 'string' && Number.isFinite(Date.parse(value))
);

const isEntry = (
  value: unknown,
  userId: string,
  now: number,
): value is ClientReassignmentOutboxEntry => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const entry = value as Partial<ClientReassignmentOutboxEntry>;
  const actions: ClientReassignmentAction[] = [
    'accept_replacement', 'choose_professional',
    'reschedule_original', 'cancel_due_to_change',
  ];
  const statuses: ClientReassignmentPersistedSyncStatus[] = [
    'syncing', 'offline_pending', 'manual_review',
  ];
  return entry.version === OUTBOX_VERSION
    && entry.userId === userId
    && typeof entry.appointmentId === 'string'
    && UUID_PATTERN.test(entry.reassignmentRequestId ?? '')
    && actions.some((action) => action === entry.decision)
    && (entry.chosenProfessionalId === null || UUID_PATTERN.test(entry.chosenProfessionalId ?? ''))
    && Number.isInteger(entry.expectedVersion) && Number(entry.expectedVersion) > 0
    && UUID_PATTERN.test(entry.requestId ?? '')
    && UUID_PATTERN.test(entry.correlationId ?? '')
    && statuses.some((status) => status === entry.status)
    && Number.isInteger(entry.attempts) && Number(entry.attempts) >= 0
    && isIsoTimestamp(entry.createdAt)
    && isIsoTimestamp(entry.updatedAt)
    && now - Date.parse(entry.createdAt) <= MAX_AGE_MS
    && (entry.lastError === null || typeof entry.lastError === 'string');
};

export const decodeClientReassignmentOutbox = (
  raw: string,
  userId: string,
  now = Date.now(),
): ClientReassignmentOutboxEntry[] | null => {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((entry): entry is ClientReassignmentOutboxEntry => (
      isEntry(entry, userId, now)
    )).slice(-MAX_ENTRIES);
  } catch {
    return null;
  }
};

export const encodeClientReassignmentOutbox = (
  entries: ClientReassignmentOutboxEntry[],
) => JSON.stringify(entries.slice(-MAX_ENTRIES));
