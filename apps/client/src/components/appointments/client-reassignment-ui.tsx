import { sharedBrand } from '@cutsync/brand';
import {
  formatClientAppointmentDateTime,
  formatMoneyCents,
} from '@cutsync/domain';
import type {
  BusinessReassignmentCandidate,
  ClientReassignmentDecision,
  ClientReassignmentDetail,
  MobileSyncStatus,
} from '@cutsync/database';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { appointmentColors } from './client-appointment-ui';
import { clientTheme } from '@/theme/client-theme';

const eventLabels: Record<string, string> = {
  'reassignment.requested': 'Alteração solicitada',
  'reassignment.validated': 'Solicitação validada',
  'reassignment.proposed': 'Novo profissional proposto',
  'reassignment.customer_decided': 'Sua decisão foi registrada',
  'reassignment.applied': 'Novo profissional confirmado',
  'reassignment.withdrawn': 'Solicitação retirada',
  'reassignment.expired': 'Prazo encerrado sem alteração',
};

const actorLabels: Record<string, string> = {
  customer: 'Você',
  professional: 'Profissional',
  staff: 'Estabelecimento',
  system: 'CutSync',
  support: 'Suporte CutSync',
};

const statusMessages: Record<string, string> = {
  awaiting_customer: 'Sua decisão é necessária',
  ready_to_apply: 'Aceite registrado; aguardando aplicação pelo estabelecimento',
  awaiting_manager: 'Sua preferência foi enviada ao estabelecimento',
  manual_review: 'O estabelecimento está revisando sua solicitação',
  applied: 'Alteração concluída',
  declined: 'Atendimento cancelado por mudança do estabelecimento',
  expired: 'Prazo encerrado sem alteração no profissional',
  withdrawn: 'Solicitação retirada pelo estabelecimento',
  failed: 'A solicitação precisa de revisão',
};

const conditionMoney = (condition: Record<string, unknown>) => (
  Number.isSafeInteger(condition.priceCents) && Number(condition.priceCents) >= 0
    ? Number(condition.priceCents)
    : null
);

const formatPrice = (value: number | null, currency: string) => (
  value === null ? 'Não informado' : formatMoneyCents(value, currency)
);

export function ClientPendingDecisionBanner({
  decision,
  pendingCount,
  onPress,
}: {
  decision: ClientReassignmentDecision;
  pendingCount: number;
  onPress: () => void;
}) {
  const formatted = formatClientAppointmentDateTime(
    decision.appointmentStartsAt,
    decision.establishmentTimezone,
  );
  return (
    <Pressable
      testID="client-pending-reassignment-banner"
      accessibilityRole="button"
      accessibilityLabel="Decisão pendente sobre alteração de profissional"
      onPress={onPress}
      style={({ pressed }) => [styles.banner, pressed && styles.pressed]}
    >
      <View style={styles.bannerTopline}>
        <Text style={styles.bannerEyebrow}>DECISÃO PENDENTE</Text>
        {pendingCount > 1 && <Text style={styles.countBadge}>{pendingCount}</Text>}
      </View>
      <Text style={styles.bannerTitle}>O estabelecimento propôs uma alteração</Text>
      <Text style={styles.bannerText}>
        {decision.serviceName} em {decision.establishmentName}, {formatted.dateLabel} às {formatted.timeLabel}.
      </Text>
      <Text style={styles.bannerProfessionals}>
        {decision.currentProfessionalName} → {decision.proposedProfessionalName ?? 'nova opção em definição'}
      </Text>
      <Text style={styles.bannerLink}>Revisar e decidir</Text>
    </Pressable>
  );
}

export function ClientReassignmentPanel({
  detail,
  candidates,
  isLoadingCandidates,
  syncStatus,
  commandError,
  onLoadCandidates,
  onRetryPending,
  onAccept,
  onChooseProfessional,
  onRescheduleOriginal,
  onCancelDueToChange,
}: {
  detail: ClientReassignmentDetail;
  candidates: BusinessReassignmentCandidate[];
  isLoadingCandidates: boolean;
  syncStatus: MobileSyncStatus;
  commandError: string | null;
  onLoadCandidates: () => void;
  onRetryPending: () => void;
  onAccept: () => void;
  onChooseProfessional: (professionalId: string) => void;
  onRescheduleOriginal: () => void;
  onCancelDueToChange: () => void;
}) {
  const [showCandidates, setShowCandidates] = useState(false);
  const previousPrice = conditionMoney(detail.previousCondition);
  const proposedPrice = conditionMoney(detail.proposedCondition);
  const busy = syncStatus === 'syncing';
  const offlinePending = syncStatus === 'offline_pending';
  const blocked = busy || offlinePending || syncStatus === 'manual_review';
  const hasActions = detail.allowedActions.length > 0;
  const initiatedBy = actorLabels[detail.initiatedByKind] ?? 'Estabelecimento';

  const openCandidates = () => {
    setShowCandidates(true);
    if (candidates.length === 0) onLoadCandidates();
  };

  return (
    <View testID="client-reassignment-panel" style={styles.panel}>
      <View style={styles.panelHeader}>
        <Text style={styles.panelEyebrow}>ALTERAÇÃO DE PROFISSIONAL</Text>
        <Text style={styles.panelTitle}>{statusMessages[detail.status] ?? 'Solicitação em andamento'}</Text>
        <Text style={styles.panelText}>Iniciada por: {initiatedBy}</Text>
      </View>

      <View style={styles.comparison}>
        <View style={styles.comparisonColumn}>
          <Text style={styles.comparisonLabel}>ANTES</Text>
          <Text style={styles.comparisonName}>{detail.currentProfessional.name}</Text>
          <Text style={styles.comparisonMeta}>{formatPrice(previousPrice, detail.currency)}</Text>
        </View>
        <Text style={styles.arrow}>→</Text>
        <View style={styles.comparisonColumn}>
          <Text style={styles.comparisonLabel}>PROPOSTA</Text>
          <Text style={styles.comparisonName}>{detail.proposedProfessional?.name ?? 'Em definição'}</Text>
          <Text style={styles.comparisonMeta}>{formatPrice(proposedPrice, detail.currency)}</Text>
        </View>
      </View>

      <View style={styles.financialNotice}>
        <Text style={styles.financialTitle}>Sinal do atendimento</Text>
        <Text style={styles.financialText}>
          Não há dados financeiros de sinal disponíveis nesta etapa. Nenhuma cobrança é alterada por esta tela.
        </Text>
      </View>

      {hasActions && (
        <View style={styles.actionList}>
          {detail.allowedActions.includes('accept_replacement') && detail.proposedProfessional && (
            <Pressable
              testID="client-reassignment-accept"
              accessibilityRole="button"
              disabled={blocked}
              onPress={onAccept}
              style={({ pressed }) => [styles.primaryAction, (pressed || blocked) && styles.pressed]}
            >
              <Text style={styles.primaryActionText}>Aceitar substituto</Text>
            </Pressable>
          )}
          {detail.allowedActions.includes('choose_professional') && (
            <Pressable
              testID="client-reassignment-choose"
              accessibilityRole="button"
              disabled={blocked}
              onPress={openCandidates}
              style={({ pressed }) => [styles.secondaryAction, (pressed || blocked) && styles.pressed]}
            >
              <Text style={styles.secondaryActionText}>Escolher outro profissional</Text>
            </Pressable>
          )}
          {detail.allowedActions.includes('reschedule_original') && (
            <Pressable
              testID="client-reassignment-reschedule-original"
              accessibilityRole="button"
              disabled={blocked}
              onPress={onRescheduleOriginal}
              style={({ pressed }) => [styles.secondaryAction, (pressed || blocked) && styles.pressed]}
            >
              <Text style={styles.secondaryActionText}>Reagendar com o profissional original</Text>
            </Pressable>
          )}
          {detail.allowedActions.includes('cancel_due_to_change') && (
            <Pressable
              testID="client-reassignment-cancel-change"
              accessibilityRole="button"
              disabled={blocked}
              onPress={onCancelDueToChange}
              style={({ pressed }) => [styles.dangerAction, (pressed || blocked) && styles.pressed]}
            >
              <Text style={styles.dangerActionText}>Cancelar sem penalidade</Text>
            </Pressable>
          )}
        </View>
      )}

      {showCandidates && (
        <View testID="client-reassignment-candidates" style={styles.candidates}>
          <Text style={styles.sectionTitle}>Profissionais disponíveis no mesmo horário</Text>
          {isLoadingCandidates ? (
            <ActivityIndicator color={sharedBrand.colors.forest} />
          ) : candidates.length === 0 ? (
            <Text style={styles.emptyText}>Nenhuma outra opção está disponível neste horário.</Text>
          ) : candidates.map((candidate) => (
            <Pressable
              key={candidate.profileId}
              accessibilityRole="button"
              disabled={blocked}
              onPress={() => onChooseProfessional(candidate.profileId)}
              style={({ pressed }) => [styles.candidate, (pressed || blocked) && styles.pressed]}
            >
              <View style={styles.candidateCopy}>
                <Text style={styles.candidateName}>{candidate.name}</Text>
                <Text style={styles.candidateMeta}>
                  {formatMoneyCents(candidate.priceCents, detail.currency)}
                  {candidate.monetaryImpact ? ' · preço diferente' : ' · mesmo preço'}
                </Text>
              </View>
              <Text style={styles.candidateLink}>Escolher</Text>
            </Pressable>
          ))}
        </View>
      )}

      {busy && (
        <View style={styles.syncNotice}>
          <ActivityIndicator size="small" color={sharedBrand.colors.forest} />
          <Text style={styles.syncText}>Enviando sua decisão…</Text>
        </View>
      )}
      {offlinePending && (
        <View testID="client-reassignment-offline-pending" style={styles.offlineNotice}>
          <Text style={styles.offlineTitle}>Decisão salva neste dispositivo</Text>
          <Text style={styles.offlineText}>
            Ela ainda não foi confirmada pelo servidor. O mesmo protocolo será reenviado quando houver conexão.
          </Text>
          <Pressable accessibilityRole="button" onPress={onRetryPending} style={styles.retryButton}>
            <Text style={styles.retryButtonText}>Tentar sincronizar agora</Text>
          </Pressable>
        </View>
      )}
      {syncStatus === 'conflict' && (
        <Text testID="client-reassignment-conflict" style={styles.errorText}>
          O estado mudou em outro dispositivo. Os dados atuais foram recarregados; revise antes de decidir novamente.
        </Text>
      )}
      {!!commandError && <Text testID="client-reassignment-command-error" style={styles.errorText}>{commandError}</Text>}

      <View style={styles.timeline}>
        <Text style={styles.sectionTitle}>Linha do tempo</Text>
        {detail.timeline.map((event, index) => {
          const occurred = formatClientAppointmentDateTime(event.occurredAt, detail.establishmentTimezone);
          return (
            <View key={event.id} style={styles.timelineItem}>
              <View style={[styles.timelineDot, index === detail.timeline.length - 1 && styles.timelineDotActive]} />
              <View style={styles.timelineCopy}>
                <Text style={styles.timelineTitle}>{eventLabels[event.eventType] ?? 'Atualização registrada'}</Text>
                <Text style={styles.timelineMeta}>
                  {actorLabels[event.actorKind] ?? event.actorKind} · {occurred.dateLabel}, {occurred.timeLabel}
                </Text>
                <Text style={styles.protocol}>Correlação {event.correlationId}</Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { gap: 10, borderRadius: 24, borderCurve: 'continuous', backgroundColor: '#FFF4D8', padding: 20, boxShadow: clientTheme.shadows.card },
  bannerTopline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bannerEyebrow: { color: '#7A5310', fontSize: 10, fontWeight: '900', letterSpacing: 1.3 },
  countBadge: { minWidth: 24, borderRadius: 999, overflow: 'hidden', backgroundColor: '#7A5310', color: '#FFFFFF', paddingHorizontal: 7, paddingVertical: 4, textAlign: 'center', fontSize: 10, fontWeight: '900' },
  bannerTitle: { color: appointmentColors.text, fontSize: 18, lineHeight: 23, fontWeight: '800' },
  bannerText: { color: appointmentColors.secondary, fontSize: 13, lineHeight: 19 },
  bannerProfessionals: { color: appointmentColors.text, fontSize: 13, fontWeight: '700' },
  bannerLink: { color: sharedBrand.colors.forest, fontSize: 12, fontWeight: '900' },
  panel: { gap: 18, borderWidth: 1, borderColor: '#D9CDAE', borderRadius: 26, borderCurve: 'continuous', backgroundColor: '#FFFDF7', padding: 20 },
  panelHeader: { gap: 7 },
  panelEyebrow: { color: '#7A5310', fontSize: 10, fontWeight: '900', letterSpacing: 1.3 },
  panelTitle: { color: appointmentColors.text, fontSize: 20, lineHeight: 25, fontWeight: '800' },
  panelText: { color: appointmentColors.secondary, fontSize: 12, lineHeight: 18 },
  comparison: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  comparisonColumn: { minWidth: 0, flex: 1, gap: 5, borderRadius: 17, backgroundColor: '#F3EEDC', padding: 14 },
  comparisonLabel: { color: appointmentColors.muted, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  comparisonName: { color: appointmentColors.text, fontSize: 14, lineHeight: 19, fontWeight: '800' },
  comparisonMeta: { color: appointmentColors.secondary, fontSize: 11 },
  arrow: { color: sharedBrand.colors.forest, fontSize: 20, fontWeight: '900' },
  financialNotice: { gap: 5, borderRadius: 16, backgroundColor: '#EEF5F0', padding: 14 },
  financialTitle: { color: sharedBrand.colors.forest, fontSize: 11, fontWeight: '900' },
  financialText: { color: appointmentColors.secondary, fontSize: 11, lineHeight: 17 },
  actionList: { gap: 10 },
  primaryAction: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: sharedBrand.colors.forest, paddingHorizontal: 16 },
  primaryActionText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
  secondaryAction: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#B8C9BE', borderRadius: 15, backgroundColor: '#FFFFFF', paddingHorizontal: 16 },
  secondaryActionText: { color: sharedBrand.colors.forest, fontSize: 13, fontWeight: '800', textAlign: 'center' },
  dangerAction: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E2B7B0', borderRadius: 15, backgroundColor: '#FFF7F5', paddingHorizontal: 16 },
  dangerActionText: { color: '#8E2F26', fontSize: 13, fontWeight: '800' },
  candidates: { gap: 10 },
  sectionTitle: { color: appointmentColors.text, fontSize: 13, fontWeight: '900' },
  candidate: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderRadius: 16, backgroundColor: '#F3EEDC', padding: 14 },
  candidateCopy: { minWidth: 0, flex: 1, gap: 3 },
  candidateName: { color: appointmentColors.text, fontSize: 13, fontWeight: '800' },
  candidateMeta: { color: appointmentColors.secondary, fontSize: 10 },
  candidateLink: { color: sharedBrand.colors.forest, fontSize: 11, fontWeight: '900' },
  emptyText: { color: appointmentColors.secondary, fontSize: 12, lineHeight: 18 },
  syncNotice: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  syncText: { color: appointmentColors.secondary, fontSize: 12 },
  offlineNotice: { gap: 8, borderRadius: 16, backgroundColor: '#FFF4D8', padding: 14 },
  offlineTitle: { color: '#7A5310', fontSize: 12, fontWeight: '900' },
  offlineText: { color: appointmentColors.secondary, fontSize: 11, lineHeight: 17 },
  retryButton: { minHeight: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#FFFFFF', paddingHorizontal: 12 },
  retryButtonText: { color: sharedBrand.colors.forest, fontSize: 11, fontWeight: '900' },
  errorText: { color: '#8E2F26', fontSize: 12, lineHeight: 18 },
  timeline: { gap: 12, paddingTop: 4 },
  timelineItem: { flexDirection: 'row', gap: 12 },
  timelineDot: { width: 10, height: 10, marginTop: 4, borderRadius: 999, backgroundColor: '#C8C1AF' },
  timelineDotActive: { backgroundColor: sharedBrand.colors.forest },
  timelineCopy: { minWidth: 0, flex: 1, gap: 3, paddingBottom: 4 },
  timelineTitle: { color: appointmentColors.text, fontSize: 12, fontWeight: '800' },
  timelineMeta: { color: appointmentColors.secondary, fontSize: 10, lineHeight: 15 },
  protocol: { color: appointmentColors.muted, fontSize: 8, lineHeight: 12 },
  pressed: { opacity: 0.72 },
});
