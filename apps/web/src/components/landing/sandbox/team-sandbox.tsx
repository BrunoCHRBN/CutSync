import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { CalendarClock, CalendarRange, Mail, UserRoundCheck, UsersRound } from 'lucide-react-native';
import { landingColors as colors, landingRadii as radii, landingTypography as typography } from '../../../theme/landing-tokens';

const WEEK_DAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'] as const;

export const TeamSandbox = () => {
  const { width } = useWindowDimensions();
  const compact = width < 720;
  const [workingDays, setWorkingDays] = useState<readonly string[]>(['Ter', 'Qua', 'Qui', 'Sex', 'Sáb']);
  const [inviteAccepted, setInviteAccepted] = useState(false);
  const scheduleSummary = useMemo(
    () => (workingDays.length === 0 ? 'Nenhum dia selecionado' : `${workingDays.length} ${workingDays.length === 1 ? 'dia' : 'dias'} · 09:00–18:00`),
    [workingDays],
  );

  const toggleDay = (day: string) => setWorkingDays((current) => (
    current.includes(day) ? current.filter((item) => item !== day) : WEEK_DAYS.filter((item) => item === day || current.includes(item))
  ));

  return (
    <View testID="business-team-demo" style={styles.card}>
      <View style={[styles.header, compact && styles.headerStacked]}>
        <View style={styles.headerCopy}>
          <View style={styles.titleRow}><UsersRound size={18} color={colors.brand} /><Text style={styles.title}>Equipe e escalas</Text></View>
          <Text style={styles.subtitle}>Convites pendentes primeiro, jornada configurável e escala da semana visível.</Text>
        </View>
        <View style={styles.availableBadge}><Text style={styles.availableBadgeText}>FUNÇÃO DISPONÍVEL</Text></View>
      </View>

      {!inviteAccepted && (
        <View style={[styles.inviteCard, compact && styles.inviteCardStacked]}>
          <View style={styles.inviteIcon}><Mail size={17} color={colors.warning} /></View>
          <View style={styles.inviteCopy}>
            <Text style={styles.inviteEyebrow}>CONVITE PENDENTE</Text>
            <Text style={styles.memberName}>Juliana Costa</Text>
            <Text style={styles.memberMeta}>Convite válido por mais 18 horas</Text>
          </View>
          <Pressable onPress={() => setInviteAccepted(true)} style={styles.acceptButton}><Text style={styles.acceptText}>Simular aceite</Text></Pressable>
        </View>
      )}

      <View style={[styles.teamGrid, compact && styles.teamGridStacked]}>
        <View style={styles.memberCard}>
          <View style={styles.memberHeader}>
            <View style={styles.avatar}><Text style={styles.avatarText}>RL</Text></View>
            <View style={styles.memberCopy}><Text style={styles.memberName}>Rafael Lima</Text><Text style={styles.memberMeta}>Ativo · 5 serviços</Text></View>
            <UserRoundCheck size={18} color={colors.success} />
          </View>
          <View style={styles.scheduleRow}><CalendarClock size={16} color={colors.brand} /><View><Text style={styles.scheduleTitle}>Jornada configurada</Text><Text style={styles.memberMeta}>Terça a sábado · 09:00–18:00</Text></View></View>
          <Pressable style={styles.secondaryButton}><Text style={styles.secondaryText}>Editar jornada e escala</Text></Pressable>
        </View>

        <View style={styles.scheduleCard}>
          <View style={styles.scheduleTitleRow}><CalendarRange size={17} color={colors.brand} /><Text style={styles.scheduleCardTitle}>Escala da semana</Text></View>
          <Text style={styles.memberMeta}>Marque os dias em que o profissional atende. A agenda pública segue essa escala.</Text>
          <View style={styles.dayRow}>
            {WEEK_DAYS.map((day) => {
              const selected = workingDays.includes(day);
              return (
                <Pressable key={day} accessibilityRole="checkbox" accessibilityLabel={day} accessibilityState={{ checked: selected }} onPress={() => toggleDay(day)} style={[styles.dayButton, selected && styles.dayButtonSelected]}>
                  <Text style={[styles.dayText, selected && styles.dayTextSelected]}>{day}</Text>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.scheduleSummary}>
            <Text style={styles.scheduleSummaryLabel}>JORNADA RESULTANTE NO EXEMPLO</Text>
            <Text style={styles.scheduleSummaryValue}>{scheduleSummary}</Text>
            <Text style={styles.scheduleSummaryNote}>Escala fictícia. Na unidade real, os horários vêm da jornada configurada para cada profissional.</Text>
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: { padding: 22, gap: 18, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, backgroundColor: colors.surface, boxShadow: '0 2px 8px rgba(20,33,25,0.05)' },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 18 },
  headerStacked: { flexDirection: 'column' },
  headerCopy: { flex: 1, gap: 7 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { color: colors.ink, fontFamily: typography.displaySemiBold, fontSize: 19 },
  subtitle: { color: colors.inkSecondary, fontFamily: typography.body, fontSize: 14, lineHeight: 21 },
  availableBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: radii.pill, backgroundColor: colors.successSoft },
  availableBadgeText: { color: colors.success, fontFamily: typography.bodySemiBold, fontSize: 12, letterSpacing: 0.5 },
  inviteCard: { padding: 13, flexDirection: 'row', alignItems: 'center', gap: 11, borderWidth: 1, borderColor: colors.warningBorder, borderRadius: radii.md, backgroundColor: colors.warningSoft },
  inviteCardStacked: { alignItems: 'flex-start', flexWrap: 'wrap' },
  inviteIcon: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 19, backgroundColor: colors.surface },
  inviteCopy: { flex: 1, minWidth: 170, gap: 2 },
  inviteEyebrow: { color: colors.warning, fontFamily: typography.bodySemiBold, fontSize: 12, letterSpacing: 0.7 },
  memberName: { color: colors.ink, fontFamily: typography.bodySemiBold, fontSize: 14 },
  memberMeta: { color: colors.inkMuted, fontFamily: typography.body, fontSize: 12, lineHeight: 18 },
  acceptButton: { minHeight: 40, paddingHorizontal: 13, alignItems: 'center', justifyContent: 'center', borderRadius: radii.sm, backgroundColor: colors.brand },
  acceptText: { color: colors.white, fontFamily: typography.bodySemiBold, fontSize: 12 },
  teamGrid: { flexDirection: 'row', gap: 12 },
  teamGridStacked: { flexDirection: 'column' },
  memberCard: { flex: 1, minWidth: 0, padding: 16, gap: 14, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, backgroundColor: colors.surfaceSoft },
  memberHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 19, backgroundColor: colors.brandSoft },
  avatarText: { color: colors.brand, fontFamily: typography.bodySemiBold, fontSize: 14 },
  memberCopy: { flex: 1, gap: 2 },
  scheduleRow: { padding: 12, flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: radii.sm, backgroundColor: colors.surface },
  scheduleTitle: { color: colors.ink, fontFamily: typography.bodySemiBold, fontSize: 12 },
  secondaryButton: { minHeight: 42, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radii.sm, backgroundColor: colors.surface },
  secondaryText: { color: colors.brand, fontFamily: typography.bodySemiBold, fontSize: 12 },
  scheduleCard: { flex: 1, minWidth: 0, padding: 16, gap: 12, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, backgroundColor: colors.surfaceSoft },
  scheduleTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  scheduleCardTitle: { color: colors.ink, fontFamily: typography.bodySemiBold, fontSize: 14 },
  dayRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  dayButton: { minWidth: 46, minHeight: 42, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: radii.sm, backgroundColor: colors.surface },
  dayButtonSelected: { borderColor: colors.brand, backgroundColor: colors.brand },
  dayText: { color: colors.inkSecondary, fontFamily: typography.bodySemiBold, fontSize: 12 },
  dayTextSelected: { color: colors.white },
  scheduleSummary: { padding: 12, gap: 4, borderRadius: radii.sm, backgroundColor: colors.brandSoft },
  scheduleSummaryLabel: { color: colors.brand, fontFamily: typography.bodySemiBold, fontSize: 12, letterSpacing: 0.6 },
  scheduleSummaryValue: { color: colors.brandStrong, fontFamily: typography.mono, fontSize: 18, fontVariant: ['tabular-nums'] },
  scheduleSummaryNote: { color: colors.inkSecondary, fontFamily: typography.body, fontSize: 12, lineHeight: 16 },
});
