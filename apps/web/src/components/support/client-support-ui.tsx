import type { ReactNode } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  formatSupportDateTime,
  supportCategoryLabels,
  supportTicketStatusLabels,
  type SupportCategory,
  type SupportTicketStatus,
} from '@cutsync/domain';
import { useRouter } from 'expo-router';
import { ArrowLeft, ChevronRight, Headphones } from 'lucide-react-native';

import { useAuth } from '../../contexts/AuthContext';
import { colors, layout, radii, typography } from '../../theme/tokens';
import { ClientShell } from '../layout/ClientShell';

export const ClientSupportPage = ({
  children,
  title,
  description,
  backLabel,
}: {
  children: ReactNode;
  title: string;
  description: string;
  backLabel?: string;
}) => {
  const router = useRouter();
  const { profile, signOut } = useAuth();

  return (
    <ClientShell
      activeRoute="support"
      userName={profile?.name}
      onSignOut={signOut}
      testID="client-web-support-shell"
    >
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.page}>
          {backLabel ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.back()}
              style={({ pressed }) => [styles.back, pressed && styles.pressed]}
            >
              <ArrowLeft size={16} color={colors.textSecondary} />
              <Text style={styles.backLabel}>{backLabel}</Text>
            </Pressable>
          ) : null}
          <View style={styles.heading}>
            <View style={styles.headingIcon}>
              <Headphones size={20} color={colors.brandPrimary} />
            </View>
            <View style={styles.headingCopy}>
              <Text style={styles.eyebrow}>SUPORTE CUTSYNC</Text>
              <Text style={styles.title}>{title}</Text>
              <Text style={styles.description}>{description}</Text>
            </View>
          </View>
          {children}
        </View>
      </ScrollView>
    </ClientShell>
  );
};

export const SupportStatusBadge = ({ status }: { status: SupportTicketStatus }) => (
  <View style={[
    styles.badge,
    status === 'waiting_user' && styles.badgeWarning,
    ['resolved', 'closed'].includes(status) && styles.badgeSuccess,
    status === 'sync_failed' && styles.badgeDanger,
  ]}>
    <Text style={styles.badgeText}>{supportTicketStatusLabels[status]}</Text>
  </View>
);

export const SupportTicketRow = ({
  id,
  protocol,
  subject,
  category,
  status,
  updatedAt,
  onPress,
}: {
  id: string;
  protocol: string;
  subject: string;
  category: SupportCategory;
  status: SupportTicketStatus;
  updatedAt: string;
  onPress: () => void;
}) => (
  <Pressable
    testID={`client-web-support-ticket-${id}`}
    accessibilityRole="button"
    onPress={onPress}
    style={({ pressed, hovered }) => [
      styles.ticket,
      hovered && styles.ticketHovered,
      pressed && styles.pressed,
    ]}
  >
    <View style={styles.ticketMain}>
      <View style={styles.ticketMetaRow}>
        <Text style={styles.protocol}>{protocol}</Text>
        <SupportStatusBadge status={status} />
      </View>
      <Text style={styles.ticketSubject}>{subject}</Text>
      <Text style={styles.ticketMeta}>
        {supportCategoryLabels[category]} · Atualizado em {formatSupportDateTime(updatedAt)}
      </Text>
    </View>
    <ChevronRight size={18} color={colors.textMuted} />
  </Pressable>
);

export const SupportChoice = ({
  label,
  description,
  selected,
  onPress,
  testID,
}: {
  label: string;
  description?: string;
  selected: boolean;
  onPress: () => void;
  testID: string;
}) => (
  <Pressable
    testID={testID}
    accessibilityRole="radio"
    accessibilityState={{ selected }}
    onPress={onPress}
    style={({ pressed }) => [
      styles.choice,
      selected && styles.choiceSelected,
      pressed && styles.pressed,
    ]}
  >
    <View style={[styles.choiceRadio, selected && styles.choiceRadioSelected]} />
    <View style={styles.choiceCopy}>
      <Text style={styles.choiceLabel}>{label}</Text>
      {description ? <Text style={styles.choiceDescription}>{description}</Text> : null}
    </View>
  </Pressable>
);

const hairline = Platform.OS === 'web' ? (0.5 as number) : StyleSheet.hairlineWidth;

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, paddingBottom: 110 },
  page: {
    width: '100%',
    maxWidth: layout.contentMax,
    alignSelf: 'center',
    paddingHorizontal: 24,
    paddingTop: 34,
    gap: 20,
  },
  back: { flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'flex-start' },
  backLabel: { color: colors.textSecondary, fontFamily: typography.bodyStrong, fontSize: 12 },
  heading: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  headingIcon: {
    width: 46,
    height: 46,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brandSecondarySoft,
  },
  headingCopy: { flex: 1 },
  eyebrow: {
    color: colors.brandPrimary,
    fontFamily: typography.bodyStrong,
    fontSize: 10,
    letterSpacing: 1.5,
  },
  title: {
    color: colors.text,
    fontFamily: typography.display,
    fontSize: 27,
    letterSpacing: -0.9,
    marginTop: 5,
  },
  description: {
    color: colors.textSecondary,
    fontFamily: typography.body,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 7,
  },
  badge: {
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: colors.infoSoft,
  },
  badgeWarning: { backgroundColor: colors.warningSoft },
  badgeSuccess: { backgroundColor: colors.successSoft },
  badgeDanger: { backgroundColor: colors.dangerSoft },
  badgeText: { color: colors.textSecondary, fontFamily: typography.bodyStrong, fontSize: 10 },
  ticket: {
    minHeight: 104,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    borderWidth: hairline,
    borderColor: colors.borderSubtle,
    borderRadius: radii.lg,
    padding: 18,
    backgroundColor: colors.surface,
  },
  ticketHovered: { borderColor: colors.brandSecondary },
  ticketMain: { flex: 1, minWidth: 0 },
  ticketMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  protocol: { color: colors.brandPrimary, fontFamily: typography.bodyStrong, fontSize: 11 },
  ticketSubject: {
    color: colors.text,
    fontFamily: typography.bodyStrong,
    fontSize: 15,
    marginTop: 9,
  },
  ticketMeta: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 11,
    marginTop: 6,
  },
  choice: {
    flex: 1,
    minWidth: 220,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 11,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: 14,
    backgroundColor: colors.surface,
  },
  choiceSelected: {
    borderColor: colors.brandPrimary,
    backgroundColor: colors.brandSecondarySoft,
  },
  choiceRadio: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    marginTop: 2,
  },
  choiceRadioSelected: {
    borderWidth: 5,
    borderColor: colors.brandPrimary,
    backgroundColor: colors.surface,
  },
  choiceCopy: { flex: 1 },
  choiceLabel: { color: colors.text, fontFamily: typography.bodyStrong, fontSize: 12 },
  choiceDescription: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 4,
  },
  pressed: { opacity: 0.7 },
});
