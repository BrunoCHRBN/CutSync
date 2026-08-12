import type { OrderPaymentCommandReceipt, ServiceOrderCommandReceipt } from '@cutsync/database';

import { secureSessionStorage } from '@/lib/secure-storage';
import { businessApi, BusinessApiError } from '@/services/business-api';

import {
  businessPosOutboxKey,
  decodeBusinessPosOutbox,
  encodeBusinessPosOutbox,
  type BusinessPosCommandInput,
  type BusinessPosOutboxEntry,
  type BusinessPosPersistedStatus,
} from './business-pos-outbox-contract';

const storageLocks = new Map<string, Promise<void>>();
const replayLocks = new Map<string, Promise<BusinessPosReplayResult>>();

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
  const key = businessPosOutboxKey(userId);
  const raw = await secureSessionStorage.getItem(key);
  if (!raw) return [];
  const decoded = decodeBusinessPosOutbox(raw, userId, now);
  if (!decoded) {
    await secureSessionStorage.removeItem(key);
    return [];
  }
  return decoded;
};

const writeUnlocked = async (userId: string, entries: BusinessPosOutboxEntry[]) => {
  const key = businessPosOutboxKey(userId);
  if (entries.length === 0) {
    await secureSessionStorage.removeItem(key);
    return;
  }
  await secureSessionStorage.setItem(key, encodeBusinessPosOutbox(entries));
};

export const enqueueBusinessPosCommand = (input: BusinessPosCommandInput) => (
  withStorageLock(input.userId, async () => {
    const entries = await readUnlocked(input.userId);
    const existing = entries.find((entry) => (
      entry.establishmentId === input.establishmentId
      && entry.serviceOrderId === input.serviceOrderId
    ));
    if (existing) return existing;
    const timestamp = new Date().toISOString();
    const entry: BusinessPosOutboxEntry = {
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
  })
);

export const removeBusinessPosCommand = (userId: string, requestId: string) => (
  withStorageLock(userId, async () => {
    const entries = await readUnlocked(userId);
    await writeUnlocked(userId, entries.filter((entry) => entry.requestId !== requestId));
  })
);

export const markBusinessPosCommand = (
  userId: string,
  requestId: string,
  status: BusinessPosPersistedStatus,
  attempts: number,
  lastError: string | null,
) => withStorageLock(userId, async () => {
  const entries = await readUnlocked(userId);
  await writeUnlocked(userId, entries.map((entry) => (
    entry.requestId === requestId
      ? {
        ...entry,
        status,
        attempts,
        lastError: lastError?.slice(0, 500) ?? null,
        updatedAt: new Date().toISOString(),
      }
      : entry
  )));
});

export const executeBusinessPosCommand = (
  entry: BusinessPosOutboxEntry,
): Promise<OrderPaymentCommandReceipt | ServiceOrderCommandReceipt> => {
  if (entry.kind === 'record_payment') {
    return businessApi.recordPayment({
      establishmentId: entry.establishmentId,
      serviceOrderId: entry.serviceOrderId,
      paymentMethodId: entry.paymentMethodId,
      amountCents: entry.amountCents,
      externalReference: entry.externalReference,
      expectedVersion: entry.expectedVersion,
      requestId: entry.requestId,
    });
  }
  if (entry.kind === 'void_payment') {
    return businessApi.voidPayment({
      establishmentId: entry.establishmentId,
      serviceOrderId: entry.serviceOrderId,
      paymentEntryId: entry.paymentEntryId,
      reason: entry.reason,
      expectedVersion: entry.expectedVersion,
      requestId: entry.requestId,
    });
  }
  return businessApi.closeServiceOrder({
    establishmentId: entry.establishmentId,
    serviceOrderId: entry.serviceOrderId,
    expectedVersion: entry.expectedVersion,
    requestId: entry.requestId,
  });
};

const CONFLICT_CODES = [
  'decision_idempotency_conflict',
  'service_order_version_conflict',
  'service_order_invalid_transition',
  'service_order_balance_unresolved',
  'payment_method_unavailable',
  'payment_exceeds_order_balance',
  'payment_entry_not_voidable',
  'payment_entry_already_voided',
] as const;

const isConflict = (error: unknown) => error instanceof BusinessApiError
  && CONFLICT_CODES.some((code) => code === error.code);

export interface BusinessPosReplayResult {
  commandKind: BusinessPosOutboxEntry['kind'] | null;
  status: 'none' | 'server_confirmed' | 'offline_pending' | 'conflict' | 'manual_review';
}

const replayUnlocked = async (
  userId: string,
  establishmentId: string,
  serviceOrderId: string,
): Promise<BusinessPosReplayResult> => {
  const entry = (await withStorageLock(userId, () => readUnlocked(userId)))
    .find((candidate) => (
      candidate.establishmentId === establishmentId
      && candidate.serviceOrderId === serviceOrderId
    ));
  if (!entry) return { commandKind: null, status: 'none' };
  if (entry.status === 'manual_review') {
    return { commandKind: entry.kind, status: 'manual_review' };
  }
  try {
    await executeBusinessPosCommand(entry);
    await removeBusinessPosCommand(userId, entry.requestId);
    return { commandKind: entry.kind, status: 'server_confirmed' };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao reenviar operação financeira.';
    if (error instanceof BusinessApiError && error.code === 'network_error') {
      await markBusinessPosCommand(
        userId, entry.requestId, 'offline_pending', entry.attempts + 1, message,
      );
      return { commandKind: entry.kind, status: 'offline_pending' };
    }
    if (isConflict(error)) {
      await removeBusinessPosCommand(userId, entry.requestId);
      return { commandKind: entry.kind, status: 'conflict' };
    }
    await markBusinessPosCommand(
      userId, entry.requestId, 'manual_review', entry.attempts + 1, message,
    );
    return { commandKind: entry.kind, status: 'manual_review' };
  }
};

export const replayBusinessPosCommand = (
  userId: string,
  establishmentId: string,
  serviceOrderId: string,
) => {
  const key = `${userId}:${establishmentId}:${serviceOrderId}`;
  const existing = replayLocks.get(key);
  if (existing) return existing;
  const replay = replayUnlocked(userId, establishmentId, serviceOrderId).finally(() => {
    if (replayLocks.get(key) === replay) replayLocks.delete(key);
  });
  replayLocks.set(key, replay);
  return replay;
};

export const classifyBusinessPosFailure = (error: unknown) => {
  if (error instanceof BusinessApiError && error.code === 'network_error') return 'offline_pending';
  if (isConflict(error)) return 'conflict';
  return 'manual_review';
};
