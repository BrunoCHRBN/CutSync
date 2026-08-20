import {
  clientReassignmentOutboxKey,
  decodeClientReassignmentOutbox,
  encodeClientReassignmentOutbox,
  type ClientReassignmentAction,
  type ClientReassignmentOutboxEntry,
  type ClientReassignmentPersistedSyncStatus,
} from '@cutsync/database';
import { Platform } from 'react-native';

import { secureChunkedStorage } from '@/lib/secure-chunked-storage';

import {
  ClientReassignmentApiError,
  decideClientReassignment,
} from './client-reassignment-service';

const memory = new Map<string, string>();
const locks = new Map<string, Promise<void>>();
const storage = {
  async getItem(key: string) {
    if (Platform.OS !== 'web') return secureChunkedStorage.getItem(key);
    return typeof globalThis.localStorage === 'undefined'
      ? memory.get(key) ?? null
      : globalThis.localStorage.getItem(key);
  },
  async setItem(key: string, value: string) {
    if (Platform.OS !== 'web') return secureChunkedStorage.setItem(key, value);
    if (typeof globalThis.localStorage === 'undefined') memory.set(key, value);
    else globalThis.localStorage.setItem(key, value);
  },
  async removeItem(key: string) {
    if (Platform.OS !== 'web') return secureChunkedStorage.removeItem(key);
    if (typeof globalThis.localStorage === 'undefined') memory.delete(key);
    else globalThis.localStorage.removeItem(key);
  },
};

const readUnlocked = async (userId: string, now = Date.now()) => {
  const raw = await storage.getItem(clientReassignmentOutboxKey(userId));
  if (!raw) return [];
  const decoded = decodeClientReassignmentOutbox(raw, userId, now);
  if (!decoded) {
    await storage.removeItem(clientReassignmentOutboxKey(userId));
    return [];
  }
  return decoded;
};

const writeUnlocked = async (userId: string, entries: ClientReassignmentOutboxEntry[]) => {
  if (entries.length === 0) {
    await storage.removeItem(clientReassignmentOutboxKey(userId));
    return;
  }
  await storage.setItem(
    clientReassignmentOutboxKey(userId),
    encodeClientReassignmentOutbox(entries),
  );
};

const withLock = async <T>(userId: string, operation: () => Promise<T>): Promise<T> => {
  const previous = locks.get(userId) ?? Promise.resolve();
  let release: () => void = () => {};
  const current = new Promise<void>((resolve) => { release = resolve; });
  const chain = previous.then(() => current);
  locks.set(userId, chain);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (locks.get(userId) === chain) locks.delete(userId);
  }
};

export const loadClientReassignmentOutbox = (userId: string) => (
  withLock(userId, () => readUnlocked(userId))
);

export const enqueueClientReassignmentCommand = async (input: {
  userId: string;
  appointmentId: string;
  reassignmentRequestId: string;
  decision: ClientReassignmentAction;
  chosenProfessionalId?: string | null;
  expectedVersion: number;
  requestId: string;
  correlationId: string;
}) => withLock(input.userId, async () => {
  const entries = await readUnlocked(input.userId);
  const existing = entries.find((entry) => (
    entry.reassignmentRequestId === input.reassignmentRequestId
    && entry.decision === input.decision
    && entry.chosenProfessionalId === (input.chosenProfessionalId ?? null)
    && entry.status !== 'manual_review'
  ));
  if (existing) return existing;
  const timestamp = new Date().toISOString();
  const entry: ClientReassignmentOutboxEntry = {
    version: 1,
    userId: input.userId,
    appointmentId: input.appointmentId,
    reassignmentRequestId: input.reassignmentRequestId,
    decision: input.decision,
    chosenProfessionalId: input.chosenProfessionalId ?? null,
    expectedVersion: input.expectedVersion,
    requestId: input.requestId,
    correlationId: input.correlationId,
    status: 'syncing',
    attempts: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
    lastError: null,
  };
  await writeUnlocked(input.userId, [...entries, entry]);
  return entry;
});

const updateEntry = async (
  userId: string,
  requestId: string,
  changes: Partial<Pick<ClientReassignmentOutboxEntry, 'status' | 'attempts' | 'updatedAt' | 'lastError'>>,
) => withLock(userId, async () => {
  const entries = await readUnlocked(userId);
  await writeUnlocked(userId, entries.map((entry) => (
    entry.requestId === requestId ? { ...entry, ...changes } : entry
  )));
});

export const removeClientReassignmentCommand = async (
  userId: string,
  requestId: string,
) => withLock(userId, async () => {
  const entries = await readUnlocked(userId);
  await writeUnlocked(userId, entries.filter((entry) => entry.requestId !== requestId));
});

export const markClientReassignmentCommand = async (
  userId: string,
  requestId: string,
  status: ClientReassignmentPersistedSyncStatus,
  attempts: number,
  lastError: string | null,
) => updateEntry(userId, requestId, {
  status,
  attempts,
  lastError,
  updatedAt: new Date().toISOString(),
});

export interface ClientReassignmentReplayResult {
  confirmed: number;
  pending: number;
  conflicts: number;
  manualReview: number;
}

export const replayClientReassignmentOutbox = async (
  userId: string,
): Promise<ClientReassignmentReplayResult> => {
  const entries = await loadClientReassignmentOutbox(userId);
  const result: ClientReassignmentReplayResult = {
    confirmed: 0,
    pending: 0,
    conflicts: 0,
    manualReview: 0,
  };
  for (const entry of entries) {
    if (entry.status === 'manual_review') {
      result.manualReview += 1;
      continue;
    }
    try {
      await decideClientReassignment({
        reassignmentRequestId: entry.reassignmentRequestId,
        decision: entry.decision,
        chosenProfessionalId: entry.chosenProfessionalId,
        expectedVersion: entry.expectedVersion,
        requestId: entry.requestId,
      });
      await removeClientReassignmentCommand(userId, entry.requestId);
      result.confirmed += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao reenviar decisão.';
      if (error instanceof ClientReassignmentApiError && error.code === 'network') {
        await markClientReassignmentCommand(
          userId, entry.requestId, 'offline_pending', entry.attempts + 1, message,
        );
        result.pending += 1;
        break;
      }
      if (error instanceof ClientReassignmentApiError && error.code === 'conflict') {
        await removeClientReassignmentCommand(userId, entry.requestId);
        result.conflicts += 1;
        continue;
      }
      await markClientReassignmentCommand(
        userId, entry.requestId, 'manual_review', entry.attempts + 1, message,
      );
      result.manualReview += 1;
    }
  }
  return result;
};
