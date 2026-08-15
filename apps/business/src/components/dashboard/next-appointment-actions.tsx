import type { BusinessAgendaItem } from '@cutsync/database';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { CheckCircle2, MessageCircle, ReceiptText } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BusinessNotice } from '@/components/ui/business-ui';
import { useBusinessOperational } from '@/contexts/business-operational-context';
import { useBusinessAppointment } from '@/features/appointments/use-business-appointment';
import { openWhatsAppChat } from '@/features/contact/whatsapp';
import { businessTheme } from '@/theme/business-theme';

export function NextAppointmentActions({ item }: { item: BusinessAgendaItem }) {
  const router = useRouter();
  const { activeContext, hasCapability } = useBusinessOperational();
  const appointment = useBusinessAppointment(item.id);
  const [notice, setNotice] = useState<string | null>(null);
  const detail = appointment.appointment;
  const canConfirm = activeContext?.accessMode === 'full' && detail?.allowedActions.includes('confirm');
  const canOpenOrder = Boolean(activeContext?.financialOpsEnabled && hasCapability('view_orders'));
  const phone = detail?.clientPhone ?? null;

  const confirm = async () => {
    setNotice(null);
    try {
      await appointment.runCommand('confirm');
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      setNotice('Atendimento confirmado.');
    } catch {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
      setNotice('Não foi possível confirmar este atendimento agora.');
    }
  };

  const openWhatsApp = async () => {
    if (!phone || !activeContext) return;
    const firstName = detail?.clientDisplayName.split(' ')[0] ?? 'Olá';
    await openWhatsAppChat(
      phone,
      `Olá, ${firstName}! Aqui é da ${activeContext.establishmentName}. Estamos entrando em contato sobre seu atendimento de hoje.`,
    );
  };

  if (appointment.isLoading || (!canConfirm && !canOpenOrder && !phone)) return null;
  return (
    <View testID="business-next-appointment-actions" style={styles.section}>
      <View style={styles.actions}>
        {canConfirm ? <Action testID="business-next-confirm" label="Confirmar" Icon={CheckCircle2} onPress={() => void confirm()} disabled={appointment.commandPending} /> : null}
        {canOpenOrder ? <Action testID="business-next-service-order" label="Comanda" Icon={ReceiptText} onPress={() => router.push(`/(app)/appointments/${item.id}`)} /> : null}
        {phone ? <Action testID="business-next-whatsapp" label="WhatsApp" Icon={MessageCircle} onPress={() => void openWhatsApp()} /> : null}
      </View>
      {notice ? <BusinessNotice testID="business-next-action-notice" tone={notice.startsWith('Atendimento confirmado') ? 'success' : 'danger'} message={notice} /> : null}
    </View>
  );
}

function Action({ testID, label, Icon, onPress, disabled = false }: { testID: string; label: string; Icon: typeof CheckCircle2; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable testID={testID} accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.action, disabled && styles.disabled, pressed && styles.pressed]}>
      <Icon color={businessTheme.colors.accentStrong} size={19} />
      <Text style={styles.actionLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  section: { gap: businessTheme.spacing.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: businessTheme.spacing.xs },
  action: { minHeight: 48, flexGrow: 1, flexBasis: 100, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderColor: businessTheme.colors.borderStrong, borderRadius: businessTheme.radii.md, paddingHorizontal: businessTheme.spacing.sm, backgroundColor: businessTheme.colors.surface },
  pressed: { opacity: businessTheme.opacity.pressed, transform: [{ scale: 0.97 }] },
  disabled: { opacity: businessTheme.opacity.disabled },
  actionLabel: { ...businessTheme.typography.caption, color: businessTheme.colors.text },
});