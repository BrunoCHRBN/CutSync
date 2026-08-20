import type { AppointmentReassignmentMutationReceipt } from '@cutsync/database';

import { secureSessionStorage } from '@/lib/secure-storage';
import { businessApi, BusinessApiError } from '@/services/business-api';

import {
  businessReassignmentRequestOutboxKey,
  decodeBusinessReassignmentRequestOutbox,
  encodeBusinessReassignmentRequestOutbox,
  type BusinessReassignmentRequestOutboxEntry,
  type BusinessReassignmentRequestPersistedStatus,
} from './business-reassignment-request-outbox-contract';

const storageLocks = new Map<string, Promise<void>>();
const replayLocks = new Map<string, Promise<BusinessReassignmentRequestReplayResult>>();

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

const readUnlocked = async (userId: string, now = Date.now()) => {
  const key = businessReassignmentRequestOutboxKey(userId);
  const raw = await secureSessionStorage.getItem(key);
  if (!raw) return [];
  const decoded = decodeBusinessReassignmentRequestOutbox(raw, userId, now);
  if (!decoded) {
    await secureSessionStorage.removeItem(key);
    return [];
  }
  return decoded;
};

const writeUnlocked = async (userId: string, entries: BusinessReassignmentRequestOutboxEntry[]) => {
  if (entries.length === 0) {
    await secureSessionStorage.removeItem(businessReassignmentRequestOutboxKey(userId));
    return;
  }
  await secureSessionStorage.setItem(
    businessReassignmentRequestOutboxKey(userId),
    encodeBusinessReassignmentRequestOutbox(entries),
  );
};

export const enqueueBusinessReassignmentRequest = async (input: Omit<
  BusinessReassignmentRequestOutboxEntry,
  'version' | 'status' | 'attempts' | 'createdAt' | 'updatedAt' | 'lastError'
>) => withStorageLock(input.userId, async () => {
  const entries = await readUnlocked(input.userId);
  const manualReview = entries.find((entry) => (
    entry.establishmentId === input.establishmentId
    && entry.appointmentId === input.appointmentId
    && entry.status === 'manual_review'
  ));
  if (manualReview) return manualReview;
  const existing = entries.find((entry) => (
    entry.establishmentId === input.establishmentId
    && entry.appointmentId === input.appointmentId
    && entry.reasonCode === input.reasonCode
    && entry.status !== 'manual_review'
  ));
  if (existing) return existing;
  const timestamp = new Date().toISOString();
  const entry: BusinessReassignmentRequestOutboxEntry = {
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

export const removeBusinessReassignmentRequest = (userId: string, requestId: string) => (
  withStorageLock(userId, async () => {
    const entries = await readUnlocked(userId);
    await writeUnlocked(userId, entries.filter((entry) => entry.requestId !== requestId));
  })
);

export const markBusinessReassignmentRequest = (
  userId: string,
  requestId: string,
  status: BusinessReassignmentRequestPersistedStatus,
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

export const executeBusinessReassignmentRequest = (
  entry: BusinessReassignmentRequestOutboxEntry,
) => businessApi.requestReassignment({
  appointmentId: entry.appointmentId,
  reasonCode: entry.reasonCode,
  responsibility: entry.responsibility,
  dueAt: entry.dueAt,
  expectedAppointmentUpdatedAt: entry.expectedAppointmentUpdatedAt,
  requestId: entry.requestId,
  correlationId: entry.correlationId,
});

const isConflict = (error: unknown) => error instanceof BusinessApiError && [
  'decision_conflict', 'decision_invalid_transition', 'decision_idempotency_conflict',
].includes(error.code);

export interface BusinessReassignmentRequestReplayResult {
  confirmedReceipt: AppointmentReassignmentMutationReceipt | null;
  status: 'none' | 'server_confirmed' | 'offline_pending' | 'conflict' | 'manual_review';
}

const replayUnlocked = async (
  userId: string,
  establishmentId: string,
  appointmentId: string,
): Promise<BusinessReassignmentRequestReplayResult> => {
  const entries = (await withStorageLock(userId, () => readUnlocked(userId)))
    .filter((candidate) => (
      candidate.establishmentId === establishmentId
      && candidate.appointmentId === appointmentId
    ));
  if (entries.length === 0) return { confirmedReceipt: null, status: 'none' };

  let confirmedReceipt: AppointmentReassignmentMutationReceipt | null = null;
  const statuses = new Set<BusinessReassignmentRequestReplayResult['status']>();
  for (const entry of entries) {
    if (entry.status === 'manual_review') {
      statuses.add('manual_review');
      continue;
    }
    try {
      const receipt = await executeBusinessReassignmentRequest(entry);
      await removeBusinessReassignmentRequest(userId, entry.requestId);
      confirmedReceipt ??= receipt;
      statuses.add('server_confirmed');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao reenviar solicitação.';
      if (error instanceof BusinessApiError && error.code === 'network_error') {
        await markBusinessReassignmentRequest(
          userId, entry.requestId, 'offline_pending', entry.attempts + 1, message,
        );
        statuses.add('offline_pending');
        continue;
      }
      if (isConflict(error)) {
        await removeBusinessReassignmentRequest(userId, entry.requestId);
        statuses.add('conflict');
        continue;
      }
      await markBusinessReassignmentRequest(
        userId, entry.requestId, 'manual_review', entry.attempts + 1, message,
      );
      statuses.add('manual_review');
    }
  }

  if (confirmedReceipt) return { confirmedReceipt, status: 'server_confirmed' };
  if (statuses.has('manual_review')) return { confirmedReceipt: null, status: 'manual_review' };
  if (statuses.has('offline_pending')) return { confirmedReceipt: null, status: 'offline_pending' };
  if (statuses.has('conflict')) return { confirmedReceipt: null, status: 'conflict' };
  return { confirmedReceipt: null, status: 'none' };
};

export const replayBusinessReassignmentRequest = (
  userId: string,
  establishmentId: string,
  appointmentId: string,
) => {
  const key = `${userId}:${establishmentId}:${appointmentId}`;
  const existing = replayLocks.get(key);
  if (existing) return existing;
  const replay = replayUnlocked(userId, establishmentId, appointmentId).finally(() => {
    if (replayLocks.get(key) === replay) replayLocks.delete(key);
  });
  replayLocks.set(key, replay);
  return replay;
};
