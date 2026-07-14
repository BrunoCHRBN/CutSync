import { Linking, Platform } from 'react-native';

export function sendWhatsAppMessage(phone: string, text: string) {
  // Limpar caracteres não-numéricos do telefone
  const cleanPhone = phone.replace(/\D/g, '');
  
  // Tratar número brasileiro: se tiver 10 ou 11 dígitos, insere DDI 55 automaticamente
  let finalPhone = cleanPhone;
  if (cleanPhone.length === 10 || cleanPhone.length === 11) {
    finalPhone = `55${cleanPhone}`;
  }

  const url = `https://wa.me/${finalPhone}?text=${encodeURIComponent(text)}`;

  if (Platform.OS === 'web') {
    window.open(url, '_blank');
  } else {
    Linking.canOpenURL(url).then((supported) => {
      if (supported) {
        Linking.openURL(url);
      } else {
        // Fallback caso app nativo do WhatsApp não esteja instalado no celular
        Linking.openURL(`https://api.whatsapp.com/send?phone=${finalPhone}&text=${encodeURIComponent(text)}`);
      }
    }).catch((err) => {
      console.warn('Erro ao abrir link do WhatsApp:', err);
    });
  }
}
