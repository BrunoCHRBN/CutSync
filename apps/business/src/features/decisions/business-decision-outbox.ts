import {
  businessDecisionOutboxKey,
  decodeBusinessDecisionOutbox,
  encodeBusinessDecisionOutbox,
  type BusinessDecisionOutboxEntry,
  type BusinessDecisionPersistedSyncStatus,
} from '@cutsync/database';

import { secureSessionStorage } from '@/lib/secure-storage';
import { businessApi, BusinessApiError } from '@/services/business-api';

const storageLocks = new Map<string, Promise<void>>();
const replayLocks = new Map<string, Promise<BusinessDecisionReplayResult>>();

const readUnlocked = async (userId: string, now = Date.now()) => {
  const key = businessDecisionOutboxKey(userId);
  const raw = await secureSessionStorage.getItem(key);
  if (!raw) return [];
  const decoded = decodeBusinessDecisionOutbox(raw, userId, now);
  if (!decoded) {
    await secureSessionStorage.removeItem(key);
    return [];
  }
  return decoded;
};

const writeUnlocked = async (userId: string, entries: BusinessDecisionOutboxEntry[]) => {
  const key = businessDecisionOutboxKey(userId);
  if (entries.length === 0) {
    await secureSessionStorage.removeItem(key);
    return;
  }
  await secureSessionStorage.setItem(key, encodeBusinessDecisionOutbox(entries));
};

const withStorageLock = async <T>(userId: string, operation: () => Promise<T>): Promise<T> => {
  const previous = storageLocks.get(userId) ?? Promise.resolve();
  let release: () => void = () => {};
  const current = new Promise<void>((resolve) => { release = resolve; });
  const chain = previous.then(() => current);
  storageLocks.set(userId, chain);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (storageLocks.get(userId) === chain) storageLocks.delete(userId);
  }
};

export const loadBusinessDecisionOutbox = (userId: string) => (
  withStorageLock(userId, () => readUnlocked(userId))
);

export const enqueueBusinessDecisionCommand = async (input: Omit<
  BusinessDecisionOutboxEntry,
  'version' | 'status' | 'attempts' | 'createdAt' | 'updatedAt' | 'lastError'
>) => withStorageLock(input.userId, async () => {
  const entries = await readUnlocked(input.userId);
  const existing = entries.find((entry) => (
    entry.establishmentId === input.establishmentId
    && entry.reassignmentRequestId === input.reassignmentRequestId
    && entry.action === input.action
    && entry.professionalId === input.professionalId
    && entry.reason === input.reason
    && entry.status !== 'manual_review'
  ));
  if (existing) return existing;
  const timestamp = new Date().toISOString();
  const entry: BusinessDecisionOutboxEntry = {
    ...input,
    version: 1,
    status: 'syncing',
    attempts: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
    lastError: null,
  };
  await writeUnlocked(input.userId, [...entries, entry]);
  return entry;
});

export const removeBusinessDecisionCommand = async (userId: string, requestId: string) => (
  withStorageLock(userId, async () => {
    const entries = await readUnlocked(userId);
    await writeUnlocked(userId, entries.filter((entry) => entry.requestId !== requestId));
  })
);

export const markBusinessDecisionCommand = async (
  userId: string,
  requestId: string,
  status: BusinessDecisionPersistedSyncStatus,
  attempts: number,
  lastError: string | null,
) => withStorageLock(userId, async () => {
  const entries = await readUnlocked(userId);
  await writeUnlocked(userId, entries.map((entry) => (
    entry.requestId === requestId
      ? { ...entry, status, attempts, lastError, updatedAt: new Date().toISOString() }
      : entry
  )));
});

export const executeBusinessDecisionCommand = (entry: BusinessDecisionOutboxEntry) => {
  const common = {
    reassignmentRequestId: entry.reassignmentRequestId,
    expectedVersion: entry.expectedVersion,
    requestId: entry.requestId,
  };
  if (entry.action === 'validate') return businessApi.validateReassignment(common);
  if (entry.action === 'apply') return businessApi.applyReassignment(common);
  if (entry.action === 'propose' && entry.professionalId) {
    return businessApi.proposeReassignment({ ...common, professionalId: entry.professionalId });
  }
  if (entry.action === 'withdraw' && entry.reason) {
    return businessApi.withdrawReassignment({ ...common, reason: entry.reason });
  }
  throw new BusinessApiError('invalid_request');
};

const isStaleCommand = (error: unknown) => error instanceof BusinessApiError && [
  'decision_conflict',
  'decision_invalid_transition',
  'decision_candidate_unavailable',
  'decision_idempotency_conflict',
].includes(error.code);

export interface BusinessDecisionReplayResult {
  confirmed: number;
  pending: number;
  conflicts: number;
  manualReview: number;
  confirmedRequestIds: string[];
  pendingRequestIds: string[];
  conflictRequestIds: string[];
  manualReviewRequestIds: string[];
}

const replayUnlocked = async (
  userId: string,
  establishmentId: string,
  preferredReassignmentRequestId?: string,
): Promise<BusinessDecisionReplayResult> => {
  const entries = (await loadBusinessDecisionOutbox(userId)).sort((left, right) => {
    if (left.reassignmentRequestId === preferredReassignmentRequestId) return -1;
    if (right.reassignmentRequestId === preferredReassignmentRequestId) return 1;
    return left.createdAt.localeCompare(right.createdAt);
  });
  const result: BusinessDecisionReplayResult = {
    confirmed: 0,
    pending: 0,
    conflicts: 0,
    manualReview: 0,
    confirmedRequestIds: [],
    pendingRequestIds: [],
    conflictRequestIds: [],
    manualReviewRequestIds: [],
  };
  for (const entry of entries) {
    if (entry.establishmentId !== establishmentId) continue;
    if (entry.status === 'manual_review') {
      result.manualReview += 1;
      result.manualReviewRequestIds.push(entry.reassignmentRequestId);
      continue;
    }
    try {
      await executeBusinessDecisionCommand(entry);
      await removeBusinessDecisionCommand(userId, entry.requestId);
      result.confirmed += 1;
      result.confirmedRequestIds.push(entry.reassignmentRequestId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao reenviar ação.';
      if (error instanceof BusinessApiError && error.code === 'network_error') {
        await markBusinessDecisionCommand(
          userId, entry.requestId, 'offline_pending', entry.attempts + 1, message,
        );
        result.pending += 1;
        result.pendingRequestIds.push(entry.reassignmentRequestId);
        break;
      }
      if (isStaleCommand(error)) {
        await removeBusinessDecisionCommand(userId, entry.requestId);
        result.conflicts += 1;
        result.conflictRequestIds.push(entry.reassignmentRequestId);
        continue;
      }
      await markBusinessDecisionCommand(
        userId, entry.requestId, 'manual_review', entry.attempts + 1, message,
      );
      result.manualReview += 1;
      result.manualReviewRequestIds.push(entry.reassignmentRequestId);
    }
  }
  return result;
};

export const replayBusinessDecisionOutbox = (
  userId: string,
  establishmentId: string,
  preferredReassignmentRequestId?: string,
) => {
  const key = `${userId}:${establishmentId}`;
  const existing = replayLocks.get(key);
  if (existing) return existing;
  const replay = replayUnlocked(
    userId,
    establishmentId,
    preferredReassignmentRequestId,
  ).finally(() => {
    if (replayLocks.get(key) === replay) replayLocks.delete(key);
  });
  replayLocks.set(key, replay);
  return replay;
};
