import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { AttentionItem } from '@cutsync/domain';

import { AppointmentCard } from '@/components/operations/appointment-card';
import {
  BusinessButton,
  BusinessCard,
  BusinessHeader,
  BusinessMetric,
  BusinessNotice,
  BusinessPage,
  BusinessPill,
  BusinessSectionTitle,
} from '@/components/ui/business-ui';
import { useBusinessOperational } from '@/contexts/business-operational-context';
import {
  formatAgendaDate,
  summarizeBusinessAgenda,
} from '@/features/agenda/business-agenda';
import { useBusinessAgenda } from '@/features/agenda/use-business-agenda';
import { businessTheme } from '@/theme/business-theme';
import { useBusinessDecisionQueue } from '@/features/decisions/use-business-decisions';
import { recordBusinessProductEvent } from '@/features/analytics/business-product-events';

const roleLabel = {
  owner: 'Proprietário',
  admin: 'Administrador',
  professional: 'Profissional',
  reception: 'Recepção',
  cashier: 'Caixa',
  finance: 'Financeiro',
  manager: 'Gestor',
} as const;

export function BusinessTodayScreen() {
  const router = useRouter();
  const { activeContext } = useBusinessOperational();
  const agenda = useBusinessAgenda();
  const decisions = useBusinessDecisionQueue();
  const attentionViewRecorded = useRef(false);
  const summary = summarizeBusinessAgenda(agenda.items);
  const timeZone = activeContext?.timezone ?? 'America/Sao_Paulo';
  const openAppointment = (appointmentId: string) => {
    router.push(`/(app)/appointments/${appointmentId}`);
  };
  const attentionItems = useMemo<AttentionItem[]>(() => {
    const decisionItems = (decisions.data ?? []).map((item): AttentionItem => ({
      id: `decision:${item.reassignmentRequestId}`,
      type: 'professional_reassignment',
      priority: item.urgency === 'overdue'
        ? 'critical'
        : item.urgency === 'urgent'
          ? 'high'
          : item.urgency === 'attention'
            ? 'normal'
            : 'low',
      title: `Mudança de profissional · ${item.clientDisplayName}`,
      description: item.proposedProfessionalName
        ? `${item.serviceName}: ${item.currentProfessionalName} → ${item.proposedProfessionalName}`
        : `${item.serviceName}: escolha a próxima ação autorizada.`,
      dueAt: item.dueAt,
      destination: `/(app)/decisions/${item.reassignmentRequestId}`,
      allowedActions: item.allowedActions,
    }));
    const now = Date.now();
    const appointmentItems = agenda.items.flatMap((item): AttentionItem[] => {
      const delayed = Date.parse(item.startsAt) < now && ['pending', 'confirmed'].includes(item.status);
      if (delayed) return [{
        id: `delay:${item.id}`,
        type: 'appointment_delay',
        priority: 'high',
        title: `Atendimento em atraso · ${item.clientDisplayName}`,
        description: `${item.serviceName} com ${item.professionalName}.`,
        dueAt: item.startsAt,
        destination: `/(app)/appointments/${item.id}`,
        allowedActions: ['open'],
      }];
      if (item.status === 'pending') return [{
        id: `confirmation:${item.id}`,
        type: 'pending_confirmation',
        priority: 'normal',
        title: `Confirmar atendimento · ${item.clientDisplayName}`,
        description: `${item.serviceName} com ${item.professionalName}.`,
        dueAt: item.startsAt,
        destination: `/(app)/appointments/${item.id}`,
        allowedActions: ['open'],
      }];
      return [];
    });
    const priorityOrder = { critical: 0, high: 1, normal: 2, low: 3 } as const;
    return [...decisionItems, ...appointmentItems]
      .sort((left, right) => priorityOrder[left.priority] - priorityOrder[right.priority]
        || String(left.dueAt ?? '').localeCompare(String(right.dueAt ?? '')))
      .slice(0, 5);
  }, [agenda.items, decisions.data]);

  useEffect(() => {
    if (!attentionItems.length || attentionViewRecorded.current) return;
    attentionViewRecorded.current = true;
    recordBusinessProductEvent({ name: 'attention_viewed', route: '/today' });
  }, [attentionItems.length]);

  return (
    <BusinessPage testID="business-today-screen">
      <BusinessHeader
        eyebrow="HOJE NA OPERAÇÃO"
        title={activeContext?.establishmentName ?? 'Meu dia'}
        description={formatAgendaDate(agenda.localDate, timeZone)}
        trailing={activeContext ? (
          <BusinessPill
            label={roleLabel[activeContext.operationalRole]}
            tone={activeContext.accessMode === 'read_only' ? 'warning' : 'success'}
          />
        ) : null}
      />

      {activeContext?.accessMode === 'read_only' ? (
        <BusinessNotice
          testID="business-read-only-notice"
          tone="warning"
          message="Modo somente leitura. Você pode consultar a operação, mas nenhuma alteração será enviada."
        />
      ) : null}

      <View style={styles.metrics}>
        <BusinessMetric testID="business-today-total" label="Atendimentos" value={String(agenda.items.length)} />
        <BusinessMetric testID="business-today-remaining" label="Restantes" value={String(summary.remaining)} emphasis="accent" />
        <BusinessMetric testID="business-today-delayed" label="Atrasos" value={String(summary.delayed)} emphasis={summary.delayed ? 'warning' : undefined} />
      </View>

      <View style={styles.section} testID="business-attention-center">
        <View style={styles.sectionHeader}>
          <View style={styles.sectionHeaderCopy}>
            <BusinessSectionTitle>Precisa da sua atenção</BusinessSectionTitle>
            <Text style={styles.sectionDescription}>Pendências e exceções ordenadas por urgência.</Text>
          </View>
          {decisions.isFetching ? <ActivityIndicator color={businessTheme.colors.accent} /> : null}
        </View>
        {attentionItems.length > 0 ? (
          <View style={styles.list}>
            {attentionItems.map((item) => (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                accessibilityLabel={`${item.title}. ${item.description}`}
                onPress={() => {
                  recordBusinessProductEvent({ name: 'attention_action_started', route: '/today' });
                  router.push(item.destination as never);
                }}
                style={({ pressed }) => pressed && styles.pressed}
              >
                <BusinessCard testID={`business-attention-${item.id}`} style={styles.attentionCard}>
                  <View style={styles.attentionCopy}>
                    <BusinessPill
                      label={item.priority === 'critical' ? 'Vencida' : item.priority === 'high' ? 'Urgente' : 'Pendente'}
                      tone={item.priority === 'critical' ? 'danger' : item.priority === 'high' ? 'warning' : 'neutral'}
                    />
                    <Text style={styles.attentionTitle}>{item.title}</Text>
                    <Text style={styles.attentionDescription}>{item.description}</Text>
                  </View>
                  <Text style={styles.attentionAction}>Resolver</Text>
                </BusinessCard>
              </Pressable>
            ))}
          </View>
        ) : (
          <BusinessNotice testID="business-attention-empty" tone="success" message="Nenhuma pendência operacional exige ação agora." />
        )}
      </View>

      <View style={styles.section}>
        <BusinessSectionTitle>Próximo atendimento</BusinessSectionTitle>
        {agenda.isLoading ? (
          <ActivityIndicator color={businessTheme.colors.accent} />
        ) : agenda.error ? (
          <>
            <BusinessNotice tone="danger" message={agenda.error} />
            <BusinessButton label="Tentar novamente" variant="secondary" onPress={() => void agenda.refresh()} />
          </>
        ) : summary.next ? (
          <AppointmentCard
            testID="business-next-appointment"
            item={summary.next}
            timeZone={timeZone}
            onPress={() => openAppointment(summary.next!.id)}
          />
        ) : (
          <BusinessNotice
            testID="business-today-empty"
            message="Nenhum próximo atendimento ativo para hoje."
          />
        )}
      </View>

      {!agenda.isLoading && !agenda.error && agenda.items.length > 0 ? (
        <View style={styles.section}>
          <BusinessSectionTitle>Sequência do dia</BusinessSectionTitle>
          <View style={styles.list}>
            {agenda.items.slice(0, 6).map((item) => (
              <AppointmentCard
                key={item.id}
                item={item}
                timeZone={timeZone}
                onPress={() => openAppointment(item.id)}
              />
            ))}
          </View>
        </View>
      ) : null}
    </BusinessPage>
  );
}

const styles = StyleSheet.create({
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: businessTheme.spacing.sm },
  section: { gap: businessTheme.spacing.sm },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: businessTheme.spacing.sm },
  sectionHeaderCopy: { flex: 1, gap: businessTheme.spacing.xxs },
  sectionDescription: { ...businessTheme.typography.caption, color: businessTheme.colors.textMuted },
  list: { gap: businessTheme.spacing.sm },
  attentionCard: { flexDirection: 'row', alignItems: 'center', gap: businessTheme.spacing.md },
  attentionCopy: { flex: 1, gap: businessTheme.spacing.xs },
  attentionTitle: { ...businessTheme.typography.bodyStrong, color: businessTheme.colors.text },
  attentionDescription: { ...businessTheme.typography.caption, color: businessTheme.colors.textSoft },
  attentionAction: { ...businessTheme.typography.bodyStrong, color: businessTheme.colors.accentStrong },
  pressed: { opacity: businessTheme.opacity.pressed },
});
