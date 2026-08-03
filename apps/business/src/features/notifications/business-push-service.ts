import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

const BUSINESS_PUSH_TOKEN_KEY = 'cutsync.business.expo-push-token';
const OPERATIONS_CHANNEL_ID = 'operations';
const INVITATIONS_CHANNEL_ID = 'invitations';
const CONFLICTS_CHANNEL_ID = 'conflicts';

export type BusinessPushStatus = 'enabled' | 'denied' | 'not_determined' | 'unsupported';

export type BusinessPushActionResult =
  | { ok: true; token: string | null }
  | { ok: false; status: BusinessPushStatus; message: string };

const getProjectId = () => {
  const configuredExtra = Constants.expoConfig?.extra as {
    eas?: { projectId?: string };
  } | null;

  return (
    Constants.easConfig?.projectId
    ?? configuredExtra?.eas?.projectId
    ?? process.env.EXPO_PUBLIC_EAS_PROJECT_ID?.trim()
    ?? null
  );
};

const getPermissionStatus = async (): Promise<BusinessPushStatus> => {
  if (Platform.OS !== 'android') return 'unsupported';
  const permission = await Notifications.getPermissionsAsync();
  if (permission.granted) return 'enabled';
  if (permission.status === Notifications.PermissionStatus.DENIED) return 'denied';
  return 'not_determined';
};

export const ensureBusinessAndroidChannels = async () => {
  if (Platform.OS !== 'android') return;
  await Promise.all([
    Notifications.setNotificationChannelAsync(OPERATIONS_CHANNEL_ID, {
      name: 'Operação diária',
      description: 'Novos atendimentos, cancelamentos e alterações de horário.',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 180, 250],
      lightColor: '#2F6A56',
      sound: 'default',
    }),
    Notifications.setNotificationChannelAsync(INVITATIONS_CHANNEL_ID, {
      name: 'Convites',
      description: 'Convites e alterações de acesso à equipe.',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 180, 250],
      lightColor: '#2F6A56',
      sound: 'default',
    }),
    Notifications.setNotificationChannelAsync(CONFLICTS_CHANNEL_ID, {
      name: 'Conflitos operacionais',
      description: 'Alertas que exigem revisão da agenda da unidade.',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 300, 180, 300],
      lightColor: '#B75D3E',
      sound: 'default',
    }),
  ]);
};

const registerToken = async (token: string, previousToken: string | null = null) => {
  if (!supabase || Platform.OS !== 'android') throw new Error('push_not_configured');

  const { error } = await supabase.rpc('register_push_device', {
    target_app_kind: 'business',
    target_platform: 'android',
    target_expo_push_token: token,
  });
  if (error) throw error;
  if (previousToken && previousToken !== token) {
    const { error: unregisterError } = await supabase.rpc('unregister_push_device', {
      target_expo_push_token: previousToken,
    });
    if (unregisterError) throw unregisterError;
  }
  await SecureStore.setItemAsync(BUSINESS_PUSH_TOKEN_KEY, token);
};

export const getStoredBusinessPushToken = () => (
  Platform.OS === 'android'
    ? SecureStore.getItemAsync(BUSINESS_PUSH_TOKEN_KEY)
    : Promise.resolve<string | null>(null)
);

export const getBusinessPushStatus = async (): Promise<BusinessPushStatus> => {
  try {
    const permissionStatus = await getPermissionStatus();
    if (permissionStatus !== 'enabled') return permissionStatus;
    return await getStoredBusinessPushToken() ? 'enabled' : 'not_determined';
  } catch {
    return 'unsupported';
  }
};

export const enableBusinessPushNotifications = async (): Promise<BusinessPushActionResult> => {
  if (Platform.OS !== 'android') {
    return {
      ok: false,
      status: 'unsupported',
      message: 'As notificações operacionais estão disponíveis na build Android instalada.',
    };
  }

  try {
    await ensureBusinessAndroidChannels();
    const currentPermission = await Notifications.getPermissionsAsync();
    const permission = currentPermission.granted
      ? currentPermission
      : await Notifications.requestPermissionsAsync();

    if (!permission.granted) {
      return {
        ok: false,
        status: 'denied',
        message: 'A permissão foi recusada. Você pode liberá-la nas configurações do aparelho.',
      };
    }

    const projectId = getProjectId();
    if (!projectId) {
      return {
        ok: false,
        status: 'unsupported',
        message: 'Esta build ainda não possui o identificador necessário para notificações.',
      };
    }

    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    await registerToken(token);
    return { ok: true, token };
  } catch {
    return {
      ok: false,
      status: 'unsupported',
      message: 'Não foi possível ativar as notificações agora. Verifique sua conexão e tente novamente.',
    };
  }
};

export const syncBusinessPushNotifications = async () => {
  if (Platform.OS !== 'android') return;

  await ensureBusinessAndroidChannels();
  const storedToken = await getStoredBusinessPushToken();
  if (!storedToken || await getPermissionStatus() !== 'enabled') return;

  const projectId = getProjectId();
  if (!projectId) return;

  const currentToken = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  await registerToken(currentToken, storedToken);
};

export const disableBusinessPushNotifications = async (): Promise<BusinessPushActionResult> => {
  if (Platform.OS !== 'android') return { ok: true, token: null };

  try {
    const token = await getStoredBusinessPushToken();
    if (token && supabase) {
      const { error } = await supabase.rpc('unregister_push_device', {
        target_expo_push_token: token,
      });
      if (error) throw error;
    }
    await SecureStore.deleteItemAsync(BUSINESS_PUSH_TOKEN_KEY);
    return { ok: true, token: null };
  } catch {
    return {
      ok: false,
      status: 'unsupported',
      message: 'Não foi possível desativar este dispositivo agora. Tente novamente.',
    };
  }
};

export const registerRotatedBusinessPushToken = async (
  token: Notifications.DevicePushToken,
) => {
  const storedToken = await getStoredBusinessPushToken();
  if (!storedToken || typeof token.data !== 'string' || Platform.OS !== 'android') return;

  await ensureBusinessAndroidChannels();
  const projectId = getProjectId();
  if (!projectId) return;

  const expoToken = (await Notifications.getExpoPushTokenAsync({
    devicePushToken: token,
    projectId,
  })).data;
  await registerToken(expoToken, storedToken);
};

export const businessNotificationChannelIds = {
  operations: OPERATIONS_CHANNEL_ID,
  invitations: INVITATIONS_CHANNEL_ID,
  conflicts: CONFLICTS_CHANNEL_ID,
} as const;
