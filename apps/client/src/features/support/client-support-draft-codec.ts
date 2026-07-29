import {
  isSupportWizardState,
  type SupportWizardState,
} from './client-support-wizard';

export const CLIENT_SUPPORT_DRAFT_VERSION = 2;
export const CLIENT_SUPPORT_DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface StoredSupportDraft {
  version: typeof CLIENT_SUPPORT_DRAFT_VERSION;
  userId: string;
  savedAt: string;
  state: SupportWizardState;
}

export const clientSupportDraftKey = (userId: string) => (
  `cutsync.client.support-draft.v${CLIENT_SUPPORT_DRAFT_VERSION}.${userId}`
);

export const legacyClientSupportDraftKeys = (userId: string) => [
  `cutsync.client.support-draft.v1.${userId}`,
];

export const encodeClientSupportDraft = (
  userId: string,
  state: SupportWizardState,
  savedAt = new Date(),
) => JSON.stringify({
  version: CLIENT_SUPPORT_DRAFT_VERSION,
  userId,
  savedAt: savedAt.toISOString(),
  state,
} satisfies StoredSupportDraft);

export const decodeClientSupportDraft = (
  raw: string,
  userId: string,
  now = Date.now(),
): SupportWizardState | null => {
  try {
    const draft = JSON.parse(raw) as Partial<StoredSupportDraft>;
    const savedAt = Date.parse(draft.savedAt ?? '');
    if (
      draft.version !== CLIENT_SUPPORT_DRAFT_VERSION
      || draft.userId !== userId
      || !isSupportWizardState(draft.state)
      || !Number.isFinite(savedAt)
      || now - savedAt > CLIENT_SUPPORT_DRAFT_TTL_MS
    ) return null;
    return draft.state;
  } catch {
    return null;
  }
};
