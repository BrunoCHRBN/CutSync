import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

const BUSINESS_PUSH_TOKEN_KEY = 'cutsync.business.expo-push-token';

export const businessNotificationChannelIds = {
  operations: 'operations',
  invitations: 'invitations',
  conflicts: 'conflicts',
  decisions: 'decisions',
} as const;

export type BusinessPushStatus = 'enabled' | 'denied' | 'not_determined' | 'unsupported';

export type BusinessPushActionResult =
  | { ok: true; token: string | null }
  | { ok: false; status: BusinessPushStatus; message: string };

const getProjectId = () => {
  const configuredExtra = Constants.expoConfig?.extra as {
    eas?: { projectId?: string };
  } | null;
  return Constants.easConfig?.projectId
    ?? configuredExtra?.eas?.projectId
    ?? process.env.EXPO_PUBLIC_EAS_PROJECT_ID?.trim()
    ?? null;
};

const getPermissionStatus = async (): Promise<BusinessPushStatus> => {
  if (Platform.OS === 'web') return 'unsupported';
  const permission = await Notifications.getPermissionsAsync();
  if (permission.granted) return 'enabled';
  if (permission.status === Notifications.PermissionStatus.DENIED) return 'denied';
  return 'not_determined';
};

const ensureAndroidChannels = async () => {
  if (Platform.OS !== 'android') return;
  await Promise.all([
    Notifications.setNotificationChannelAsync(businessNotificationChannelIds.operations, {
      name: 'Operação',
      description: 'Atualizações da agenda e dos atendimentos.',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 180, 250],
      lightColor: '#EACD73',
      sound: 'default',
    }),
    Notifications.setNotificationChannelAsync(businessNotificationChannelIds.decisions, {
      name: 'Decisões',
      description: 'Solicitações que precisam de decisão ou aplicação.',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 180, 250],
      lightColor: '#EACD73',
      sound: 'default',
    }),
    Notifications.setNotificationChannelAsync(businessNotificationChannelIds.invitations, {
      name: 'Convites',
      description: 'Convites para equipes e estabelecimentos.',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 180, 250],
      lightColor: '#EACD73',
      sound: 'default',
    }),
    Notifications.setNotificationChannelAsync(businessNotificationChannelIds.conflicts, {
      name: 'Conflitos operacionais',
      description: 'Situações da operação que exigem revisão.',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 300, 180, 300],
      lightColor: '#D85A4E',
      sound: 'default',
    }),
  ]);
};

const registerToken = async (token: string) => {
  if (!supabase || (Platform.OS !== 'android' && Platform.OS !== 'ios')) {
    throw new Error('push_not_configured');
  }
  const { error } = await supabase.rpc('register_push_device', {
    target_app_kind: 'business',
    target_platform: Platform.OS,
    target_expo_push_token: token,
  });
  if (error) throw error;
  await SecureStore.setItemAsync(BUSINESS_PUSH_TOKEN_KEY, token);
};

export const getBusinessPushStatus = async (): Promise<BusinessPushStatus> => {
  try {
    return await getPermissionStatus();
  } catch {
    return 'unsupported';
  }
};

export const enableBusinessPushNotifications = async (): Promise<BusinessPushActionResult> => {
  if (Platform.OS === 'web') {
    return {
      ok: false,
      status: 'unsupported',
      message: 'As notificações estão disponíveis somente no aplicativo instalado.',
    };
  }
  try {
    await ensureAndroidChannels();
    const currentPermission = await Notifications.getPermissionsAsync();
    const permission = currentPermission.granted
      ? currentPermission
      : await Notifications.requestPermissionsAsync();
    if (!permission.granted) {
      return {
        ok: false,
        status: 'denied',
        message: 'A permissão foi recusada. Libere as notificações nas configurações do aparelho.',
      };
    }
    const projectId = getProjectId();
    if (!projectId) {
      return {
        ok: false,
        status: 'unsupported',
        message: 'Esta build não possui o identificador necessário para notificações.',
      };
    }
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    await registerToken(token);
    return { ok: true, token };
  } catch {
    return {
      ok: false,
      status: 'unsupported',
      message: 'Não foi possível ativar as notificações agora. Tente novamente.',
    };
  }
};

export const syncBusinessPushNotifications = async () => {
  if (Platform.OS === 'web') return;
  await ensureAndroidChannels();
  if (await getPermissionStatus() !== 'enabled') return;
  const projectId = getProjectId();
  if (!projectId) return;
  const currentToken = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  const storedToken = await SecureStore.getItemAsync(BUSINESS_PUSH_TOKEN_KEY);
  await registerToken(currentToken);
  if (storedToken && storedToken !== currentToken && supabase) {
    await supabase.rpc('unregister_push_device', {
      target_expo_push_token: storedToken,
    });
  }
};

export const registerRotatedBusinessPushToken = async (
  token: Notifications.DevicePushToken,
) => {
  const storedToken = await SecureStore.getItemAsync(BUSINESS_PUSH_TOKEN_KEY);
  if (!storedToken || typeof token.data !== 'string') return;
  await ensureAndroidChannels();
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

export const disableBusinessPushNotifications = async (): Promise<BusinessPushActionResult> => {
  if (Platform.OS === 'web') return { ok: true, token: null };
  try {
    const token = await SecureStore.getItemAsync(BUSINESS_PUSH_TOKEN_KEY);
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
      message: 'Não foi possível desativar este dispositivo agora.',
    };
  }
};
