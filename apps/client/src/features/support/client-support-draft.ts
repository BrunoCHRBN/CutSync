import { Platform } from 'react-native';

import { secureChunkedStorage } from '@/lib/secure-chunked-storage';

import type { SupportWizardState } from './client-support-wizard';
import {
  clientSupportDraftKey,
  decodeClientSupportDraft,
  encodeClientSupportDraft,
  legacyClientSupportDraftKeys,
} from './client-support-draft-codec';

const draftStorage = {
  getItem: async (key: string) => {
    if (Platform.OS === 'web') return globalThis.localStorage?.getItem(key) ?? null;
    return secureChunkedStorage.getItem(key);
  },
  setItem: async (key: string, value: string) => {
    if (Platform.OS === 'web') {
      globalThis.localStorage?.setItem(key, value);
      return;
    }
    await secureChunkedStorage.setItem(key, value);
  },
  removeItem: async (key: string) => {
    if (Platform.OS === 'web') {
      globalThis.localStorage?.removeItem(key);
      return;
    }
    await secureChunkedStorage.removeItem(key);
  },
};

export const saveClientSupportDraft = async (
  userId: string,
  state: SupportWizardState,
) => {
  await draftStorage.setItem(
    clientSupportDraftKey(userId),
    encodeClientSupportDraft(userId, state),
  );
};

export const removeClientSupportDraft = async (userId: string) => {
  await Promise.all([
    draftStorage.removeItem(clientSupportDraftKey(userId)),
    ...legacyClientSupportDraftKeys(userId).map((key) => draftStorage.removeItem(key)),
  ]);
};

export const loadClientSupportDraft = async (
  userId: string,
  now = Date.now(),
): Promise<SupportWizardState | null> => {
  await Promise.all(
    legacyClientSupportDraftKeys(userId).map((key) => draftStorage.removeItem(key)),
  );
  const raw = await draftStorage.getItem(clientSupportDraftKey(userId));
  if (!raw) return null;
  const state = decodeClientSupportDraft(raw, userId, now);
  if (!state) {
    await removeClientSupportDraft(userId);
    return null;
  }
  return state;
};
