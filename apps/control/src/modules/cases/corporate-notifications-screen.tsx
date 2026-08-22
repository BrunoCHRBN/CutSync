import { Link, useFocusEffect } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { FeedbackState } from '@/components/cloud/feedback-state';
import { FilterTabs, type FilterTab } from '@/components/cloud/filter-tabs';
import { StatusBadge } from '@/components/cloud/status-badge';
import { ControlNotice } from '@/components/control-ui';
import { SectionPage } from '@/components/section-page';
import {
  corporateCasePriorityLabels,
  corporateCasePriorityTone,
  formatCorporateCaseDate,
  isCorporateCaseUuid,
} from '@/modules/cases/corporate-cases-presentation';
import { corporateCasePath } from '@/navigation/cloud-routes';
import {
  getCorporateCasesReadContext,
  listCorporateNotifications,
  type CorporateNotification,
} from '@/services/corporate-cases';
import { cloudTheme } from '@/theme/cloud-components';

type NotificationFilter = 'all' | 'unread';

const notificationTabs: FilterTab<NotificationFilter>[] = [
  { id: 'all', label: 'Todas' },
  { id: 'unread', label: 'Não lidas' },
];

function notificationCaseId(notification: CorporateNotification): string | null {
  const candidate = notification.routePayload.case_id ?? notification.routePayload.caseId;
  return typeof candidate === 'string' && isCorporateCaseUuid(candidate) ? candidate : null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Não foi possível consultar as notificações.';
}

export function CorporateNotificationsScreen() {
  const [filter, setFilter] = useState<NotificationFilter>('all');
  const [notifications, setNotifications] = useState<CorporateNotification[]>([]);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setLoading(true);
    setError('');
    try {
      const context = await getCorporateCasesReadContext();
      if (currentRequest !== requestId.current) return;
      setEnabled(context.enabled);
      if (!context.enabled) {
        setNotifications([]);
        return;
      }
      const rows = await listCorporateNotifications({
        unreadOnly: filter === 'unread',
        limit: 50,
      });
      if (currentRequest === requestId.current) setNotifications(rows);
    } catch (loadError) {
      if (currentRequest === requestId.current) {
        setNotifications([]);
        setError(errorMessage(loadError));
      }
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, [filter]);

  useFocusEffect(useCallback(() => {
    void load();
    return () => { requestId.current += 1; };
  }, [load]));

  return (
    <SectionPage
      eyebrow="CHAMADOS · NOTIFICAÇÕES IN-APP"
      title="Notificações"
      description="Atualizações de chamados destinadas ao seu usuário e novamente filtradas pela autorização atual."
    >
      <FilterTabs tabs={notificationTabs} value={filter} onChange={setFilter} />
      <ControlNotice
        title="Somente leitura"
        message="Marcação de leitura e entregas por e-mail ou push entram em um corte posterior."
        tone="info"
      />

      {loading ? <ControlNotice title="Notificações" message="Consultando atualizações protegidas..." tone="info" /> : null}
      {!loading && error ? (
        <FeedbackState kind="error" title="Notificações indisponíveis" message={error} actionLabel="Tentar novamente" onAction={() => { void load(); }} />
      ) : null}
      {!loading && !error && enabled === false ? (
        <FeedbackState kind="maintenance" title="Área ainda não habilitada" message="A ativação operacional dos chamados continua desligada no backend." />
      ) : null}
      {!loading && !error && enabled && notifications.length === 0 ? (
        <FeedbackState kind="empty" title="Nenhuma notificação" message={filter === 'unread' ? 'Você não possui notificações não lidas.' : 'Você ainda não recebeu atualizações de chamados.'} />
      ) : null}
      {!loading && !error && enabled ? notifications.map((notification) => {
        const caseId = notificationCaseId(notification);
        const content = (
          <View style={[styles.card, !notification.readAt && styles.cardUnread]}>
            <View style={styles.cardHeader}>
              <View style={styles.cardCopy}>
                <Text style={styles.title}>{notification.title}</Text>
                <Text style={styles.meta}>{formatCorporateCaseDate(notification.createdAt)} · {notification.eventCategory}</Text>
              </View>
              <View style={styles.badges}>
                {!notification.readAt ? <StatusBadge label="Não lida" tone="info" /> : null}
                <StatusBadge label={corporateCasePriorityLabels[notification.importance]} tone={corporateCasePriorityTone[notification.importance]} />
              </View>
            </View>
            <Text style={styles.body}>{notification.body}</Text>
            {caseId ? <Text style={styles.linkLabel}>Abrir chamado →</Text> : null}
          </View>
        );
        return caseId ? (
          <Link key={notification.notificationId} href={corporateCasePath(caseId) as never} asChild>
            <Pressable accessibilityRole="link">{content}</Pressable>
          </Link>
        ) : (
          <View key={notification.notificationId}>{content}</View>
        );
      }) : null}
    </SectionPage>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: cloudTheme.spacing.sm,
    padding: cloudTheme.spacing.lg,
    borderWidth: 1,
    borderColor: cloudTheme.colors.border,
    borderRadius: cloudTheme.radii.lg,
    backgroundColor: cloudTheme.colors.surface,
  },
  cardUnread: { borderColor: cloudTheme.colors.info, backgroundColor: cloudTheme.colors.infoSoft },
  cardHeader: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: cloudTheme.spacing.md },
  cardCopy: { flex: 1, minWidth: 220, gap: 2 },
  title: { ...cloudTheme.type.bodyStrong, color: cloudTheme.colors.text },
  meta: { ...cloudTheme.type.caption, color: cloudTheme.colors.textMuted },
  body: { ...cloudTheme.type.body, color: cloudTheme.colors.textSecondary },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: cloudTheme.spacing.xs },
  linkLabel: { ...cloudTheme.type.smallStrong, color: cloudTheme.colors.accent },
});
