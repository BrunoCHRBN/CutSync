import React from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { CalendarPlus, LockKeyhole, X } from 'lucide-react-native';
import { colors, elevations, layout, radii, spacing, typeScale } from '../../theme/tokens';
import { CalendarSlotSelection } from './operational-calendar';

interface SlotActionSheetProps {
  selection: CalendarSlotSelection | null;
  professionalName?: string;
  canBlock?: boolean;
  onClose: () => void;
  onBook: (selection: CalendarSlotSelection) => void;
  onBlock: (selection: CalendarSlotSelection) => void;
}

export const SlotActionSheet = ({ selection, professionalName, canBlock = true, onClose, onBook, onBlock }: SlotActionSheetProps) => {
  const { width } = useWindowDimensions();
  if (!selection) return null;
  const desktop = width >= layout.desktopBreakpoint;
  const dateLabel = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit',
  }).format(selection.startsAt);

  return (
    <Modal animationType={Platform.OS === 'web' ? 'fade' : 'slide'} onRequestClose={onClose} transparent visible>
      <Pressable accessibilityLabel="Fechar ações do horário" onPress={onClose} style={styles.backdrop}>
        <Pressable
          accessibilityViewIsModal
          onPress={(event) => event.stopPropagation()}
          style={[styles.sheet, desktop && styles.desktopSheet]}
          testID="calendar-slot-actions"
        >
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.eyebrow}>HORÁRIO SELECIONADO</Text>
              <Text style={styles.title}>{dateLabel}</Text>
              {professionalName ? <Text style={styles.description}>{professionalName}</Text> : null}
            </View>
            <Pressable accessibilityLabel="Fechar" onPress={onClose} style={styles.close}><X color={colors.textPrimary} size={19} /></Pressable>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => onBook(selection)}
            style={({ pressed }) => [styles.option, pressed && styles.pressed]}
            testID="calendar-slot-new-appointment"
          >
            <View style={styles.optionIcon}><CalendarPlus color={colors.brandPrimary} size={21} /></View>
            <View style={styles.optionCopy}><Text style={styles.optionTitle}>Novo atendimento</Text><Text style={styles.optionDescription}>Abrir o fluxo de agendamento com data e profissional preenchidos.</Text></View>
          </Pressable>
          {canBlock ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => onBlock(selection)}
              style={({ pressed }) => [styles.option, pressed && styles.pressed]}
              testID="calendar-slot-new-block"
            >
              <View style={styles.optionIcon}><LockKeyhole color={colors.brandPrimary} size={21} /></View>
              <View style={styles.optionCopy}><Text style={styles.optionTitle}>Bloquear horário</Text><Text style={styles.optionDescription}>Criar uma pausa, ausência ou indisponibilidade operacional.</Text></View>
            </Pressable>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(24,32,27,0.34)', flex: 1, justifyContent: 'flex-end', padding: spacing.md },
  sheet: { backgroundColor: colors.surface, borderRadius: radii.xl, gap: spacing.sm, padding: spacing.xl, ...elevations.overlay },
  desktopSheet: { alignSelf: 'center', marginBottom: 'auto', marginTop: 'auto', maxWidth: 520, width: '100%' },
  header: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.md, marginBottom: spacing.sm },
  headerCopy: { flex: 1, gap: spacing.xs },
  eyebrow: { ...typeScale.label, color: colors.brandPrimary, letterSpacing: 1.2 },
  title: { ...typeScale.cardTitle, color: colors.textPrimary, textTransform: 'capitalize' },
  description: { ...typeScale.small, color: colors.textSecondary },
  close: { alignItems: 'center', borderColor: colors.borderSubtle, borderRadius: radii.md, borderWidth: 1, height: 44, justifyContent: 'center', width: 44 },
  option: { alignItems: 'center', borderColor: colors.borderSubtle, borderRadius: radii.md, borderWidth: 1, flexDirection: 'row', gap: spacing.md, minHeight: 76, padding: spacing.md },
  optionIcon: { alignItems: 'center', backgroundColor: colors.brandSecondarySoft, borderRadius: radii.md, height: 44, justifyContent: 'center', width: 44 },
  optionCopy: { flex: 1, gap: 2 },
  optionTitle: { ...typeScale.bodyStrong, color: colors.textPrimary },
  optionDescription: { ...typeScale.small, color: colors.textSecondary },
  pressed: { backgroundColor: colors.surfacePressed },
});
