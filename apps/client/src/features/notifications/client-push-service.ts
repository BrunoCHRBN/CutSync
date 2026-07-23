import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

const CLIENT_PUSH_TOKEN_KEY = 'cutsync.client.expo-push-token';
const APPOINTMENTS_CHANNEL_ID = 'appointments';

export type ClientPushStatus = 'enabled' | 'denied' | 'not_determined' | 'unsupported';

type ClientPushActionResult =
  | { ok: true; token: string | null }
  | { ok: false; status: ClientPushStatus; message: string };

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

const getPermissionStatus = async (): Promise<ClientPushStatus> => {
  if (Platform.OS === 'web') return 'unsupported';
  const permission = await Notifications.getPermissionsAsync();
  if (permission.granted) return 'enabled';
  if (permission.status === Notifications.PermissionStatus.DENIED) return 'denied';
  return 'not_determined';
};

const ensureAndroidChannel = async () => {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(APPOINTMENTS_CHANNEL_ID, {
    name: 'Agendamentos',
    description: 'Confirmações, alterações e lembretes dos seus atendimentos.',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 180, 250],
    lightColor: '#294D3A',
    sound: 'default',
  });
};

const registerToken = async (token: string) => {
  if (!supabase || (Platform.OS !== 'android' && Platform.OS !== 'ios')) {
    throw new Error('push_not_configured');
  }

  const { error } = await supabase.rpc('register_push_device', {
    target_app_kind: 'client',
    target_platform: Platform.OS,
    target_expo_push_token: token,
  });
  if (error) throw error;
  await SecureStore.setItemAsync(CLIENT_PUSH_TOKEN_KEY, token);
};

export const getStoredClientPushToken = () => (
  Platform.OS === 'web'
    ? Promise.resolve<string | null>(null)
    : SecureStore.getItemAsync(CLIENT_PUSH_TOKEN_KEY)
);

export const getClientPushStatus = async (): Promise<ClientPushStatus> => {
  try {
    return await getPermissionStatus();
  } catch {
    return 'unsupported';
  }
};

export const enableClientPushNotifications = async (): Promise<ClientPushActionResult> => {
  if (Platform.OS === 'web') {
    return {
      ok: false,
      status: 'unsupported',
      message: 'As notificações no celular só podem ser ativadas no aplicativo instalado.',
    };
  }

  try {
    await ensureAndroidChannel();
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

export const syncClientPushNotifications = async () => {
  if (Platform.OS === 'web') return;

  const storedToken = await getStoredClientPushToken();
  if (!storedToken || await getPermissionStatus() !== 'enabled') return;

  const projectId = getProjectId();
  if (!projectId) return;

  const currentToken = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  await registerToken(currentToken);

  if (currentToken !== storedToken && supabase) {
    await supabase.rpc('unregister_push_device', {
      target_expo_push_token: storedToken,
    });
  }
};

export const disableClientPushNotifications = async (): Promise<ClientPushActionResult> => {
  if (Platform.OS === 'web') return { ok: true, token: null };

  try {
    const token = await getStoredClientPushToken();
    if (token && supabase) {
      const { error } = await supabase.rpc('unregister_push_device', {
        target_expo_push_token: token,
      });
      if (error) throw error;
    }
    await SecureStore.deleteItemAsync(CLIENT_PUSH_TOKEN_KEY);
    return { ok: true, token: null };
  } catch {
    return {
      ok: false,
      status: 'unsupported',
      message: 'Não foi possível desativar este dispositivo agora. Tente novamente.',
    };
  }
};

export const registerRotatedClientPushToken = async (token: Notifications.DevicePushToken) => {
  const storedToken = await getStoredClientPushToken();
  if (!storedToken || typeof token.data !== 'string') return;

  const projectId = getProjectId();
  if (!projectId) return;

  const expoToken = (await Notifications.getExpoPushTokenAsync({
    devicePushToken: token,
    projectId,
  })).data;
  await registerToken(expoToken);

  if (expoToken !== storedToken && supabase) {
    await supabase.rpc('unregister_push_device', {
      target_expo_push_token: storedToken,
    });
  }
};

export const clientNotificationsChannelId = APPOINTMENTS_CHANNEL_ID;
