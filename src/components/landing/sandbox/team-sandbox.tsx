import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { CalendarClock, Mail, Percent, UserRoundCheck, UsersRound } from 'lucide-react-native';
import { landingColors as colors, landingRadii as radii, landingTypography as typography } from '../../../theme/landing-tokens';

const productionExample = 1200;

export const TeamSandbox = () => {
  const { width } = useWindowDimensions();
  const compact = width < 720;
  const [commissionRate, setCommissionRate] = useState(50);
  const [inviteAccepted, setInviteAccepted] = useState(false);
  const projectedCommission = useMemo(() => productionExample * commissionRate / 100, [commissionRate]);

  return (
    <View testID="business-team-demo" style={styles.card}>
      <View style={[styles.header, compact && styles.headerStacked]}>
        <View style={styles.headerCopy}>
          <View style={styles.titleRow}><UsersRound size={18} color={colors.brand} /><Text style={styles.title}>Equipe e escalas</Text></View>
          <Text style={styles.subtitle}>Convites pendentes primeiro, jornada configurável e comissão tratada como projeção.</Text>
        </View>
        <View style={styles.availableBadge}><Text style={styles.availableBadgeText}>FUNÇÃO DISPONÍVEL</Text></View>
      </View>

      {!inviteAccepted && (
        <View style={[styles.inviteCard, compact && styles.inviteCardStacked]}>
          <View style={styles.inviteIcon}><Mail size={17} color={colors.warning} /></View>
          <View style={styles.inviteCopy}>
            <Text style={styles.inviteEyebrow}>CONVITE PENDENTE</Text>
            <Text style={styles.memberName}>Profissional convidado</Text>
            <Text style={styles.memberMeta}>Convite válido por mais 18 horas</Text>
          </View>
          <Pressable onPress={() => setInviteAccepted(true)} style={styles.acceptButton}><Text style={styles.acceptText}>Simular aceite</Text></Pressable>
        </View>
      )}

      <View style={[styles.teamGrid, compact && styles.teamGridStacked]}>
        <View style={styles.memberCard}>
          <View style={styles.memberHeader}>
            <View style={styles.avatar}><Text style={styles.avatarText}>P</Text></View>
            <View style={styles.memberCopy}><Text style={styles.memberName}>Profissional da equipe</Text><Text style={styles.memberMeta}>Ativo · 5 serviços</Text></View>
            <UserRoundCheck size={18} color={colors.success} />
          </View>
          <View style={styles.scheduleRow}><CalendarClock size={16} color={colors.brand} /><View><Text style={styles.scheduleTitle}>Jornada configurada</Text><Text style={styles.memberMeta}>Terça a sábado · 09:00–18:00</Text></View></View>
          <Pressable style={styles.secondaryButton}><Text style={styles.secondaryText}>Editar jornada e escala</Text></Pressable>
        </View>

        <View style={styles.commissionCard}>
          <View style={styles.commissionTitleRow}><Percent size={17} color={colors.brand} /><Text style={styles.commissionTitle}>Comissão configurada</Text></View>
          <Text style={styles.memberMeta}>Escolha o percentual usado nas projeções de produção concluída.</Text>
          <View style={styles.rateRow}>
            {[30, 40, 50, 60].map((rate) => (
              <Pressable key={rate} accessibilityRole="radio" accessibilityState={{ selected: commissionRate === rate }} onPress={() => setCommissionRate(rate)} style={[styles.rateButton, commissionRate === rate && styles.rateButtonSelected]}>
                <Text style={[styles.rateText, commissionRate === rate && styles.rateTextSelected]}>{rate}%</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.projection}>
            <Text style={styles.projectionLabel}>REPASSE PROJETADO NO EXEMPLO</Text>
            <Text selectable style={styles.projectionValue}>R$ {projectedCommission.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</Text>
            <Text style={styles.projectionNote}>Sobre R$ 1.200,00 de produção fictícia concluída. Não representa pagamento realizado.</Text>
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
  availableBadgeText: { color: colors.success, fontFamily: typography.bodySemiBold, fontSize: 11, letterSpacing: 0.5 },
  inviteCard: { padding: 13, flexDirection: 'row', alignItems: 'center', gap: 11, borderWidth: 1, borderColor: colors.warningBorder, borderRadius: radii.md, backgroundColor: colors.warningSoft },
  inviteCardStacked: { alignItems: 'flex-start', flexWrap: 'wrap' },
  inviteIcon: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 19, backgroundColor: colors.surface },
  inviteCopy: { flex: 1, minWidth: 170, gap: 2 },
  inviteEyebrow: { color: colors.warning, fontFamily: typography.bodySemiBold, fontSize: 11, letterSpacing: 0.7 },
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
  commissionCard: { flex: 1, minWidth: 0, padding: 16, gap: 12, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, backgroundColor: colors.surfaceSoft },
  commissionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  commissionTitle: { color: colors.ink, fontFamily: typography.bodySemiBold, fontSize: 14 },
  rateRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  rateButton: { minWidth: 52, minHeight: 42, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: radii.sm, backgroundColor: colors.surface },
  rateButtonSelected: { borderColor: colors.brand, backgroundColor: colors.brand },
  rateText: { color: colors.inkSecondary, fontFamily: typography.bodySemiBold, fontSize: 12 },
  rateTextSelected: { color: colors.white },
  projection: { padding: 12, gap: 4, borderRadius: radii.sm, backgroundColor: colors.brandSoft },
  projectionLabel: { color: colors.brand, fontFamily: typography.bodySemiBold, fontSize: 11, letterSpacing: 0.6 },
  projectionValue: { color: colors.brandStrong, fontFamily: typography.mono, fontSize: 22, fontVariant: ['tabular-nums'] },
  projectionNote: { color: colors.inkSecondary, fontFamily: typography.body, fontSize: 11, lineHeight: 16 },
});
