import type { PropsWithChildren } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import type { ClientNotificationChannel } from '@cutsync/validation';

import { useSession } from '@/contexts/session-context';
import {
  type ClientAvatarAsset,
  type ClientProfile,
  loadClientProfile,
  removeClientAvatar,
  saveClientPreferences,
  saveClientProfile,
  uploadClientAvatar,
} from '@/features/profile/client-profile-service';

type ProfileActionResult = { ok: true } | { ok: false; message: string };

interface ClientProfileContextValue {
  profile: ClientProfile | null;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  updateProfile: (name: string, phone: string | null) => Promise<ProfileActionResult>;
  updatePreferences: (
    channels: ClientNotificationChannel[],
    marketingAccepted: boolean,
  ) => Promise<ProfileActionResult>;
  updateAvatar: (asset: ClientAvatarAsset) => Promise<ProfileActionResult>;
  removeAvatar: () => Promise<ProfileActionResult>;
}

const ClientProfileContext = createContext<ClientProfileContextValue | null>(null);

const getActionMessage = (error: unknown) => (
  error instanceof Error ? error.message : 'Não foi possível concluir esta ação. Tente novamente.'
);

export function ClientProfileProvider({ children }: PropsWithChildren) {
  const { user } = useSession();
  const [profile, setProfile] = useState<ClientProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user) {
      setProfile(null);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const nextProfile = await loadClientProfile();
      setProfile({ ...nextProfile, email: nextProfile.email || user.email || '' });
    } catch (nextError) {
      setError(getActionMessage(nextError));
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const runUpdate = useCallback(async (action: () => Promise<ClientProfile>): Promise<ProfileActionResult> => {
    setIsSaving(true);
    setError(null);
    try {
      const nextProfile = await action();
      setProfile({ ...nextProfile, email: nextProfile.email || user?.email || '' });
      return { ok: true };
    } catch (nextError) {
      const message = getActionMessage(nextError);
      setError(message);
      return { ok: false, message };
    } finally {
      setIsSaving(false);
    }
  }, [user?.email]);

  const value = useMemo<ClientProfileContextValue>(() => ({
    profile,
    isLoading,
    isSaving,
    error,
    refresh,
    updateProfile: (name, phone) => runUpdate(() => saveClientProfile(name, phone)),
    updatePreferences: (channels, marketingAccepted) => runUpdate(
      () => saveClientPreferences(channels, marketingAccepted),
    ),
    updateAvatar: (asset) => {
      if (!user) return Promise.resolve({ ok: false, message: 'Entre novamente para atualizar sua foto.' });
      return runUpdate(() => uploadClientAvatar(user.id, asset));
    },
    removeAvatar: () => {
      if (!user) return Promise.resolve({ ok: false, message: 'Entre novamente para remover sua foto.' });
      return runUpdate(() => removeClientAvatar(user.id));
    },
  }), [error, isLoading, isSaving, profile, refresh, runUpdate, user]);

  return <ClientProfileContext.Provider value={value}>{children}</ClientProfileContext.Provider>;
}

export function useClientProfile() {
  const context = useContext(ClientProfileContext);
  if (!context) throw new Error('useClientProfile deve ser usado dentro de ClientProfileProvider.');
  return context;
}
