import type { Database } from '@cutsync/database';
import {
  CLIENT_AVATAR_MAX_BYTES,
  CLIENT_NOTIFICATION_CHANNELS,
  getClientAvatarValidationMessage,
  type ClientNotificationChannel,
} from '@cutsync/validation';
import { fetch } from 'expo/fetch';

import { supabase } from '@/lib/supabase';

type ClientProfileRow = Database['public']['Functions']['get_my_client_profile']['Returns'][number];

export interface ClientProfile {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  avatarUrl: string | null;
  notificationChannels: ClientNotificationChannel[];
  marketingAccepted: boolean;
}

export interface ClientAvatarAsset {
  uri: string;
  fileName?: string | null;
  fileSize?: number | null;
  mimeType?: string | null;
}

const AVATAR_BUCKET = 'client-avatars';
const AVATAR_FILE_NAME = 'avatar';

const mapProfile = (row: ClientProfileRow): ClientProfile => ({
  id: row.id,
  name: row.name,
  email: row.email ?? '',
  phone: row.phone,
  avatarUrl: row.avatar_url,
  notificationChannels: CLIENT_NOTIFICATION_CHANNELS.filter((channel) => row.notification_channels.includes(channel)),
  marketingAccepted: row.lgpd_marketing_accepted,
});

const friendlyProfileError = (error: unknown) => {
  const value = error as { code?: string; message?: string };
  const message = value?.message?.toLowerCase() ?? '';
  if (value?.code === 'PGRST202' || message.includes('get_my_client_profile')) {
    return 'O perfil mobile ainda precisa da atualização mais recente do CutSync.';
  }
  if (message.includes('network') || message.includes('fetch')) {
    return 'Não foi possível conectar. Verifique sua internet e tente novamente.';
  }
  if (message.includes('invalid_profile_name')) return 'O nome informado não é válido.';
  if (message.includes('invalid_profile_phone')) return 'O telefone informado não é válido.';
  if (message.includes('invalid_notification_channel')) return 'Uma preferência de comunicação não é válida.';
  if (message.includes('invalid_avatar_url')) return 'A foto selecionada não pôde ser confirmada.';
  return 'Não foi possível atualizar seu perfil agora. Tente novamente.';
};

const requireClient = () => {
  if (!supabase) throw new Error('client_not_configured');
  return supabase;
};

const readSingleProfile = async (
  request: PromiseLike<{ data: ClientProfileRow | null; error: unknown }>,
): Promise<ClientProfile> => {
  try {
    const { data, error } = await request;
    if (error) throw error;
    if (!data) throw new Error('profile_not_found');
    return mapProfile(data);
  } catch (error) {
    throw new Error(friendlyProfileError(error));
  }
};

export const loadClientProfile = () => {
  const client = requireClient();
  return readSingleProfile(client.rpc('get_my_client_profile').single());
};

export const saveClientProfile = (name: string, phone: string | null) => {
  const client = requireClient();
  return readSingleProfile(client.rpc('update_my_client_profile', {
    target_name: name,
    target_phone: phone ?? '',
  }).single());
};

export const saveClientPreferences = (
  channels: ClientNotificationChannel[],
  marketingAccepted: boolean,
) => {
  const client = requireClient();
  return readSingleProfile(client.rpc('update_my_client_preferences', {
    target_notification_channels: channels,
    target_lgpd_marketing_accepted: marketingAccepted,
  }).single());
};

export const uploadClientAvatar = async (userId: string, asset: ClientAvatarAsset) => {
  const validationMessage = getClientAvatarValidationMessage(asset);
  if (validationMessage) throw new Error(validationMessage);

  const client = requireClient();
  try {
    const response = await fetch(asset.uri);
    if (!response.ok) throw new Error('avatar_read_failed');
    const file = await response.arrayBuffer();
    if (file.byteLength > CLIENT_AVATAR_MAX_BYTES) throw new Error('avatar_too_large');

    const objectPath = userId + '/' + AVATAR_FILE_NAME;
    const { error: uploadError } = await client.storage.from(AVATAR_BUCKET).upload(objectPath, file, {
      cacheControl: '3600',
      contentType: asset.mimeType as string,
      upsert: true,
    });
    if (uploadError) throw uploadError;

    const { data } = client.storage.from(AVATAR_BUCKET).getPublicUrl(objectPath);
    const publicUrl = data.publicUrl + '?v=' + Date.now();
    return await readSingleProfile(client.rpc('update_my_client_avatar', {
      target_avatar_url: publicUrl,
    }).single());
  } catch (error) {
    if (error instanceof Error && error.message === 'avatar_too_large') {
      throw new Error('A foto deve ter no máximo 5 MB.');
    }
    throw new Error(friendlyProfileError(error));
  }
};

export const removeClientAvatar = async (userId: string) => {
  const client = requireClient();
  const profile = await readSingleProfile(client.rpc('update_my_client_avatar', {
    target_avatar_url: null,
  }).single());
  await client.storage.from(AVATAR_BUCKET).remove([userId + '/' + AVATAR_FILE_NAME]);
  return profile;
};
