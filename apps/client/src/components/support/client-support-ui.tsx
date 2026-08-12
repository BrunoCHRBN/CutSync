import {
  formatSupportDateTime,
  supportCategoryLabels,
  supportSyncStatusLabels,
  supportTicketStatusLabels,
  type SupportMessageAuthor,
  type SupportSyncStatus,
  type SupportTicketStatus,
} from '@cutsync/domain';
import { getForbiddenInputMessage } from '@cutsync/validation';
import type { ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
} from 'react-native';

import type {
  ClientSupportMessage,
  ClientSupportTicket,
} from '@/features/support/client-support-service';
import { clientTheme } from '@/theme/client-theme';

export const supportColors = {
  background: clientTheme.colors.canvas,
  card: clientTheme.colors.surface,
  text: clientTheme.colors.ink,
  secondary: clientTheme.colors.inkSoft,
  muted: clientTheme.colors.inkMuted,
  border: clientTheme.colors.border,
  accent: clientTheme.colors.forest,
  accentSoft: clientTheme.colors.forestSoft,
  warning: clientTheme.colors.warning,
  warningSoft: clientTheme.colors.warningSoft,
  danger: clientTheme.colors.danger,
  dangerSoft: clientTheme.colors.dangerSoft,
  info: clientTheme.colors.info,
  infoSoft: clientTheme.colors.infoSoft,
};

const statusTone = (status: SupportTicketStatus) => {
  if (status === 'resolved' || status === 'closed') return styles.badgeSuccess;
  if (status === 'waiting_user' || status === 'queued') return styles.badgeWarning;
  if (status === 'sync_failed') return styles.badgeDanger;
  return styles.badgeInfo;
};

export function SupportStatusBadge({ status }: { status: SupportTicketStatus }) {
  return (
    <View style={[styles.badge, statusTone(status)]}>
      <Text style={styles.badgeText}>{supportTicketStatusLabels[status]}</Text>
    </View>
  );
}

export function SupportSyncBadge({ status }: { status: SupportSyncStatus }) {
  return (
    <View style={[
      styles.syncBadge,
      status === 'failed' && styles.syncBadgeFailed,
      status === 'synced' && styles.syncBadgeSuccess,
    ]}>
      <Text style={styles.syncBadgeText}>{supportSyncStatusLabels[status]}</Text>
    </View>
  );
}

export function SupportTicketCard({
  ticket,
  onPress,
}: {
  ticket: ClientSupportTicket;
  onPress: () => void;
}) {
  return (
    <Pressable
      testID={`client-support-ticket-${ticket.id}`}
      accessibilityRole="button"
      accessibilityLabel={`Abrir chamado ${ticket.protocol}: ${ticket.subject}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.ticketCard,
        ticket.status === 'waiting_user' && styles.ticketCardWaiting,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.ticketTopRow}>
        <Text style={styles.category}>{supportCategoryLabels[ticket.category]}</Text>
        <SupportStatusBadge status={ticket.status} />
      </View>
      <Text selectable style={styles.ticketSubject}>{ticket.subject}</Text>
      {ticket.status === 'waiting_user' ? (
        <Text style={styles.ticketNextAction}>Aguardando sua resposta</Text>
      ) : null}
      <Text selectable style={styles.ticketProtocol}>Protocolo {ticket.protocol}</Text>
      <View style={styles.ticketFooter}>
        <Text style={styles.ticketDate}>
          Atualizado em {formatSupportDateTime(ticket.lastMessageAt)}
        </Text>
      </View>
    </Pressable>
  );
}

export function SupportChoiceGroup({
  label,
  options,
  value,
  onChange,
  testIDPrefix,
}: {
  label: string;
  options: { value: string; label: string; description?: string }[];
  value: string | null;
  onChange: (value: string) => void;
  testIDPrefix: string;
}) {
  return (
    <View accessibilityRole="radiogroup" style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.choiceList}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              testID={`${testIDPrefix}-${option.value}`}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              onPress={() => onChange(option.value)}
              style={({ pressed }) => [
                styles.choice,
                selected && styles.choiceSelected,
                pressed && styles.pressed,
              ]}
            >
              <View style={[styles.radio, selected && styles.radioSelected]}>
                {selected ? <View style={styles.radioDot} /> : null}
              </View>
              <View style={styles.choiceCopy}>
                <Text style={[styles.choiceLabel, selected && styles.choiceLabelSelected]}>
                  {option.label}
                </Text>
                {option.description ? (
                  <Text style={styles.choiceDescription}>{option.description}</Text>
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

interface SupportTextFieldProps extends TextInputProps {
  label: string;
  helper?: string;
  testID: string;
  onUnsafeInput: (message: string | null) => void;
}

export function SupportTextField({
  label,
  helper,
  testID,
  onChangeText,
  onUnsafeInput,
  multiline,
  ...props
}: SupportTextFieldProps) {
  const handleChange = (value: string) => {
    const unsafeMessage = getForbiddenInputMessage(value);
    if (unsafeMessage) {
      onUnsafeInput(unsafeMessage);
      return;
    }
    onUnsafeInput(null);
    onChangeText?.(value);
  };

  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        {...props}
        testID={testID}
        accessibilityLabel={label}
        multiline={multiline}
        onChangeText={handleChange}
        placeholderTextColor={supportColors.muted}
        style={[styles.input, multiline && styles.textArea]}
        textAlignVertical={multiline ? 'top' : 'center'}
      />
      {helper ? <Text style={styles.helper}>{helper}</Text> : null}
    </View>
  );
}

const authorLabel: Record<SupportMessageAuthor, string> = {
  requester: 'Você',
  support: 'Equipe CutSync',
  system: 'CutSync',
};

export function SupportMessageBubble({ message }: { message: ClientSupportMessage }) {
  const requester = message.authorKind === 'requester';
  return (
    <View
      testID={`client-support-message-${message.id}`}
      style={[
        styles.messageRow,
        requester ? styles.messageRowRequester : styles.messageRowSupport,
      ]}
    >
      <View style={[
        styles.messageBubble,
        requester ? styles.messageBubbleRequester : styles.messageBubbleSupport,
        message.authorKind === 'system' && styles.messageBubbleSystem,
      ]}>
        <Text style={[
          styles.messageAuthor,
          requester && styles.messageAuthorRequester,
        ]}>
          {authorLabel[message.authorKind]}
        </Text>
        <Text selectable style={[
          styles.messageBody,
          requester && styles.messageBodyRequester,
        ]}>
          {message.body}
        </Text>
        <Text style={[
          styles.messageDate,
          requester && styles.messageDateRequester,
        ]}>
          {formatSupportDateTime(message.createdAt)}
        </Text>
      </View>
    </View>
  );
}

export function SupportMetadataRow({
  label,
  value,
  action,
  last,
}: {
  label: string;
  value: string;
  action?: ReactNode;
  last?: boolean;
}) {
  return (
    <View style={[styles.metadataRow, !last && styles.metadataRowBorder]}>
      <View style={styles.metadataCopy}>
        <Text style={styles.metadataLabel}>{label}</Text>
        <Text selectable style={styles.metadataValue}>{value}</Text>
      </View>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    minHeight: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: clientTheme.radii.pill,
    paddingHorizontal: clientTheme.spacing.sm,
    backgroundColor: supportColors.infoSoft,
  },
  badgeInfo: { backgroundColor: supportColors.infoSoft },
  badgeSuccess: { backgroundColor: clientTheme.colors.successSoft },
  badgeWarning: { backgroundColor: supportColors.warningSoft },
  badgeDanger: { backgroundColor: supportColors.dangerSoft },
  badgeText: {
    color: supportColors.text,
    fontSize: 12,
    fontWeight: '800',
  },
  syncBadge: {
    alignSelf: 'flex-start',
    borderRadius: clientTheme.radii.pill,
    paddingHorizontal: clientTheme.spacing.sm,
    paddingVertical: 6,
    backgroundColor: supportColors.warningSoft,
  },
  syncBadgeFailed: { backgroundColor: supportColors.dangerSoft },
  syncBadgeSuccess: { backgroundColor: clientTheme.colors.successSoft },
  syncBadgeText: { color: supportColors.secondary, fontSize: 12, fontWeight: '800' },
  ticketCard: {
    gap: clientTheme.spacing.sm,
    borderWidth: 1,
    borderColor: supportColors.border,
    borderRadius: clientTheme.radii.card,
    borderCurve: 'continuous',
    padding: clientTheme.spacing.lg,
    backgroundColor: supportColors.card,
    boxShadow: clientTheme.shadows.card,
  },
  ticketCardWaiting: {
    borderColor: clientTheme.colors.warning,
    backgroundColor: supportColors.warningSoft,
  },
  ticketTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: clientTheme.spacing.sm,
  },
  category: {
    flex: 1,
    color: supportColors.accent,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  ticketSubject: { color: supportColors.text, fontSize: 17, lineHeight: 23, fontWeight: '800' },
  ticketProtocol: { color: supportColors.secondary, fontSize: 12, lineHeight: 16 },
  ticketNextAction: { color: supportColors.warning, fontSize: 12, fontWeight: '900' },
  ticketFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: clientTheme.spacing.sm,
  },
  ticketDate: { flex: 1, color: supportColors.muted, fontSize: 12 },
  fieldGroup: { gap: clientTheme.spacing.sm },
  fieldLabel: { color: supportColors.text, fontSize: 13, fontWeight: '800' },
  choiceList: { gap: clientTheme.spacing.xs },
  choice: {
    minHeight: clientTheme.sizing.touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: clientTheme.spacing.sm,
    borderWidth: 1,
    borderColor: supportColors.border,
    borderRadius: clientTheme.radii.md,
    borderCurve: 'continuous',
    padding: clientTheme.spacing.md,
    backgroundColor: clientTheme.colors.surfaceMuted,
  },
  choiceSelected: {
    borderColor: supportColors.accent,
    backgroundColor: supportColors.accentSoft,
  },
  radio: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: supportColors.muted,
    borderRadius: 10,
  },
  radioSelected: { borderColor: supportColors.accent },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: supportColors.accent },
  choiceCopy: { flex: 1, gap: 2 },
  choiceLabel: { color: supportColors.text, fontSize: 13, fontWeight: '700' },
  choiceLabelSelected: { color: supportColors.accent },
  choiceDescription: { color: supportColors.secondary, fontSize: 12, lineHeight: 16 },
  input: {
    minHeight: clientTheme.sizing.control,
    borderWidth: 1,
    borderColor: supportColors.border,
    borderRadius: clientTheme.radii.md,
    borderCurve: 'continuous',
    paddingHorizontal: clientTheme.spacing.md,
    color: supportColors.text,
    backgroundColor: clientTheme.colors.surfaceMuted,
    fontSize: 15,
  },
  textArea: {
    minHeight: 132,
    paddingTop: clientTheme.spacing.md,
    paddingBottom: clientTheme.spacing.md,
  },
  helper: { color: supportColors.muted, fontSize: 12, lineHeight: 16 },
  messageRow: { width: '100%', flexDirection: 'row' },
  messageRowRequester: { justifyContent: 'flex-end' },
  messageRowSupport: { justifyContent: 'flex-start' },
  messageBubble: {
    maxWidth: '88%',
    gap: 6,
    borderRadius: clientTheme.radii.lg,
    borderCurve: 'continuous',
    padding: clientTheme.spacing.md,
  },
  messageBubbleRequester: {
    borderBottomRightRadius: clientTheme.radii.sm,
    backgroundColor: supportColors.accent,
  },
  messageBubbleSupport: {
    borderWidth: 1,
    borderColor: supportColors.border,
    borderBottomLeftRadius: clientTheme.radii.sm,
    backgroundColor: supportColors.card,
  },
  messageBubbleSystem: {
    maxWidth: '100%',
    borderColor: clientTheme.colors.infoBorder,
    backgroundColor: supportColors.infoSoft,
  },
  messageAuthor: { color: supportColors.accent, fontSize: 12, fontWeight: '900' },
  messageAuthorRequester: { color: 'rgba(255, 255, 255, 0.78)' },
  messageBody: { color: supportColors.text, fontSize: 14, lineHeight: 21 },
  messageBodyRequester: { color: clientTheme.colors.white },
  messageDate: { color: supportColors.muted, fontSize: 12 },
  messageDateRequester: { color: 'rgba(255, 255, 255, 0.68)' },
  metadataRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: clientTheme.spacing.sm,
    paddingVertical: clientTheme.spacing.sm,
  },
  metadataRowBorder: { borderBottomWidth: 1, borderBottomColor: supportColors.border },
  metadataCopy: { flex: 1, gap: 3 },
  metadataLabel: { color: supportColors.muted, fontSize: 12, fontWeight: '800', textTransform: 'uppercase' },
  metadataValue: { color: supportColors.text, fontSize: 13, lineHeight: 18, fontWeight: '700' },
  pressed: { opacity: clientTheme.opacity.pressed, transform: [{ scale: 0.99 }] },
});
