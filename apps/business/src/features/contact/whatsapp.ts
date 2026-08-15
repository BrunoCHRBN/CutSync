import * as Linking from 'expo-linking';
import { Alert, Platform } from 'react-native';

export const sanitizeWhatsAppPhone = (input: string) => {
  const normalized = input.trim().replace(/[\s().-]/g, '').replace(/^\+/, '');
  if (!/^\d{8,15}$/.test(normalized) || normalized.startsWith('00')) {
    throw new Error('O telefone precisa estar em formato internacional.');
  }
  return normalized;
};

export const buildWhatsAppUrl = (phone: string, message: string) => {
  const number = sanitizeWhatsAppPhone(phone);
  const text = message.trim();
  if (!text || text.length > 1000) throw new Error('A mensagem não pôde ser preparada.');
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
};

export async function openWhatsAppChat(phone: string, message: string) {
  try {
    const url = buildWhatsAppUrl(phone, message);
    const canOpen = await Linking.canOpenURL(url).catch(() => true);
    if (!canOpen) throw new Error('Nenhum aplicativo pode abrir este link.');
    await Linking.openURL(url);
    return true;
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Tente novamente.';
    Alert.alert(
      'Não foi possível abrir o WhatsApp',
      Platform.OS === 'web'
        ? `${detail} Verifique sua conexão ou abra o WhatsApp Web manualmente.`
        : `${detail} Instale o WhatsApp ou tente pelo navegador.`,
    );
    return false;
  }
}