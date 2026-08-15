import * as Linking from 'expo-linking';
import { Mail, MessageCircle, Phone } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BusinessSectionTitle } from '@/components/ui/business-ui';
import { openWhatsAppChat } from '@/features/contact/whatsapp';
import { businessTheme } from '@/theme/business-theme';

export function AppointmentContactActions({ clientName, phone, email, establishmentName }: { clientName: string; phone: string | null; email: string | null; establishmentName: string }) {
  if (!phone && !email) return null;
  const message = `Olá, ${clientName.split(' ')[0]}! Aqui é da ${establishmentName}. Estamos entrando em contato sobre seu atendimento.`;
  return (
    <View testID="business-appointment-contact" style={styles.section}>
      <BusinessSectionTitle testID="business-appointment-contact-title">Contato</BusinessSectionTitle>
      <View style={styles.actions}>
        {phone ? <Action testID="business-appointment-call" label="Ligar" Icon={Phone} onPress={() => void Linking.openURL(`tel:${phone.replace(/[^\d+]/g, '')}`).catch(() => undefined)} /> : null}
        {phone ? <Action testID="business-appointment-whatsapp" label="WhatsApp" Icon={MessageCircle} onPress={() => void openWhatsAppChat(phone, message)} /> : null}
        {email ? <Action testID="business-appointment-email" label="E-mail" Icon={Mail} onPress={() => void Linking.openURL(`mailto:${encodeURIComponent(email)}`).catch(() => undefined)} /> : null}
      </View>
    </View>
  );
}

function Action({ testID, label, Icon, onPress }: { testID: string; label: string; Icon: typeof Phone; onPress: () => void }) {
  return (
    <Pressable testID={testID} accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
      <Icon color={businessTheme.colors.accentStrong} size={20} />
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  section: { gap: businessTheme.spacing.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: businessTheme.spacing.xs },
  action: { minHeight: 50, flexGrow: 1, flexBasis: 96, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderColor: businessTheme.colors.borderStrong, borderRadius: businessTheme.radii.md, backgroundColor: businessTheme.colors.surface },
  pressed: { opacity: businessTheme.opacity.pressed, transform: [{ scale: 0.97 }] },
  label: { ...businessTheme.typography.caption, color: businessTheme.colors.text },
});