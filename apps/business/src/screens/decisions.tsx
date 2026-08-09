import type { DecisionQueueItem } from '@cutsync/database';
import { Redirect, useRouter } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import {
  BusinessButton,
  BusinessCard,
  BusinessHeader,
  BusinessNotice,
  BusinessPage,
  BusinessPill,
  BusinessSectionTitle,
} from '@/components/ui/business-ui';
import { useBusinessOperational } from '@/contexts/business-operational-context';
import { hasBusinessDecisionsNavigation } from '@/features/access/business-access';
import { useBusinessDecisionQueue } from '@/features/decisions/use-business-decisions';
import { businessTheme } from '@/theme/business-theme';

const urgencyLabels: Record<DecisionQueueItem['urgency'], string> = {
  normal: 'No prazo',
  attention: 'Atenção',
  urgent: 'Urgente',
  overdue: 'Prazo vencido',
};

const urgencyTone = (
  urgency: DecisionQueueItem['urgency'],
): 'neutral' | 'warning' | 'danger' => (
  urgency === 'overdue' ? 'danger' : urgency === 'urgent' || urgency === 'attention' ? 'warning' : 'neutral'
);

const formatDateTime = (value: string) => new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
}).format(new Date(value));

export function BusinessDecisionsScreen() {
  const router = useRouter();
  const { activeContext } = useBusinessOperational();
  const queue = useBusinessDecisionQueue();

  if (!hasBusinessDecisionsNavigation(activeContext?.capabilities)) {
    return <Redirect href="/today" />;
  }

  return (
    <BusinessPage testID="business-decisions-screen">
      <BusinessHeader
        eyebrow="DECISÕES"
        title="Pendências da operação"
        description="Acompanhe responsáveis, prazos e impactos antes de qualquer mudança no atendimento."
      />

      {queue.isError ? (
        <BusinessNotice
          tone="danger"
          message="Não foi possível confirmar a fila no servidor. Atualize para tentar novamente."
        />
      ) : null}

      <View style={styles.sectionHeader}>
        <BusinessSectionTitle>Fila da unidade</BusinessSectionTitle>
        {queue.isFetching ? <ActivityIndicator color={businessTheme.colors.accent} /> : null}
      </View>

      {queue.isLoading ? (
        <BusinessCard style={styles.centered}>
          <ActivityIndicator color={businessTheme.colors.accent} />
          <Text style={styles.muted}>Confirmando decisões com o servidor…</Text>
        </BusinessCard>
      ) : null}

      {!queue.isLoading && !queue.isError && queue.data?.length === 0 ? (
        <BusinessCard>
          <Text style={styles.cardTitle}>Nenhuma decisão pendente</Text>
          <Text style={styles.muted}>A unidade não possui reatribuições aguardando ação.</Text>
        </BusinessCard>
      ) : null}

      {queue.data?.map((item) => (
        <BusinessCard key={item.reassignmentRequestId} testID={`decision-${item.reassignmentRequestId}`}>
          <View style={styles.rowBetween}>
            <BusinessPill label={urgencyLabels[item.urgency]} tone={urgencyTone(item.urgency)} />
            <Text style={styles.deadline}>até {formatDateTime(item.dueAt)}</Text>
          </View>
          <Text selectable style={styles.cardTitle}>{item.clientDisplayName}</Text>
          <Text selectable style={styles.muted}>
            {item.serviceName} · {formatDateTime(item.appointmentStartsAt)}
          </Text>
          <Text selectable style={styles.detail}>
            {item.currentProfessionalName}
            {item.proposedProfessionalName ? ` → ${item.proposedProfessionalName}` : ' · substituto não definido'}
          </Text>
          <View style={styles.tags}>
            <BusinessPill label={`Responsável: ${item.responsibility}`} />
            {item.customerDecisionRequired ? <BusinessPill label="Cliente deve decidir" tone="warning" /> : null}
            {item.monetaryImpact ? <BusinessPill label="Impacto financeiro" tone="warning" /> : null}
          </View>
          <BusinessButton
            label="Ver contexto e timeline"
            variant="secondary"
            onPress={() => router.push(`/(app)/decisions/${item.reassignmentRequestId}` as never)}
          />
        </BusinessCard>
      ))}

      <BusinessButton
        label="Atualizar fila"
        variant="ghost"
        loading={queue.isRefetching}
        onPress={() => void queue.refetch()}
      />
    </BusinessPage>
  );
}

const styles = StyleSheet.create({
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  centered: { alignItems: 'center' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: businessTheme.spacing.xs },
  cardTitle: { ...businessTheme.typography.heading, color: businessTheme.colors.text },
  detail: { ...businessTheme.typography.bodyStrong, color: businessTheme.colors.text },
  muted: { ...businessTheme.typography.body, color: businessTheme.colors.textSoft },
  deadline: { ...businessTheme.typography.caption, color: businessTheme.colors.textMuted },
});
