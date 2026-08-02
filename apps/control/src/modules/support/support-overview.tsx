import { Link, useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useControlAuth } from '@/contexts/control-auth-context';
import { CLOUD_ROUTES } from '@/navigation/cloud-routes';
import {
  ControlSupportError,
  getControlSupportOverview,
  type SupportOverview as SupportOverviewData,
  type SupportTicketSummary,
} from '@/services/control-support';
import { cloudTheme } from '@/theme/cloud-components';

function loadErrorMessage(error: unknown): string {
  if (!(error instanceof ControlSupportError)) {
    return 'Não foi possível carregar o resumo do suporte.';
  }
  if (error.code === 'forbidden') return 'Seu acesso atual não permite consultar o resumo.';
  if (error.code === 'aal2_required') return 'Confirme o autenticador para continuar.';
  return 'O resumo do suporte está temporariamente indisponível.';
}

function isSlaAtRisk(ticket: SupportTicketSummary): boolean {
  if (!ticket.firstResponseDueAt || ticket.firstRespondedAt) return false;
  return Date.parse(ticket.firstResponseDueAt) < Date.now();
}

function formatWhen(value: string | null): string {
  return value ? new Date(value).toLocaleString('pt-BR') : '—';
}

const statusLabels: Record<string, string> = {
  queued: 'Na fila',
  open: 'Aberto',
  in_progress: 'Em andamento',
  waiting_user: 'Aguardando usuário',
  resolved: 'Resolvido',
  closed: 'Fechado',
  sync_failed: 'Falha de sync',
};

export function SupportOverviewScreen() {
  const { can } = useControlAuth();
  const [overview, setOverview] = useState<SupportOverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    setError('');
    try {
      const result = await getControlSupportOverview({
        status: null,
        priority: null,
        category: null,
        limit: 25,
      });
      if (id === requestId.current) setOverview(result);
    } catch (loadError) {
      if (id === requestId.current) {
        setOverview(null);
        setError(loadErrorMessage(loadError));
      }
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    if (can('control.support.read')) void load();
    return () => { requestId.current += 1; };
  }, [can, load]));

  const counts = overview?.counts;
  const recentActivity = useMemo(() => {
    if (!overview?.tickets.length) return [];
    return [...overview.tickets]
      .sort((a, b) => {
        const aAt = Date.parse(a.lastMessageAt ?? a.updatedAt);
        const bAt = Date.parse(b.lastMessageAt ?? b.updatedAt);
        return bAt - aAt;
      })
      .slice(0, 8);
  }, [overview]);

  const attention = useMemo(() => {
    if (!overview) return [];
    const rows: { key: string; label: string; detail: string; href: string }[] = [];
    if (counts && counts.slaAtRisk > 0) {
      rows.push({
        key: 'sla',
        label: `${counts.slaAtRisk} com risco de SLA`,
        detail: 'Priorizar primeira resposta fora do prazo',
        href: `${CLOUD_ROUTES.suporte.atendimentos}?sla=at_risk`,
      });
    }
    if (counts && counts.critical > 0) {
      rows.push({
        key: 'critical',
        label: `${counts.critical} críticos`,
        detail: 'Prioridade crítica na fila autorizada',
        href: `${CLOUD_ROUTES.suporte.atendimentos}?priority=critical`,
      });
    }
    if (counts && counts.syncFailed > 0) {
      rows.push({
        key: 'sync',
        label: `${counts.syncFailed} falhas de sync`,
        detail: 'Sincronização JSM irregular',
        href: `${CLOUD_ROUTES.suporte.atendimentos}?status=sync_failed`,
      });
    }
    const slaTickets = overview.tickets.filter(isSlaAtRisk).slice(0, 3);
    for (const ticket of slaTickets) {
      rows.push({
        key: `ticket-${ticket.id}`,
        label: ticket.protocol,
        detail: ticket.subject,
        href: `${CLOUD_ROUTES.suporte.atendimentos}?ticketId=${ticket.id}`,
      });
    }
    return rows;
  }, [counts, overview]);

  const distribution = counts
    ? [
        { label: 'Abertos', value: counts.open },
        { label: 'Em andamento', value: counts.inProgress },
        { label: 'Aguardando usuário', value: counts.waitingUser },
        { label: 'Na fila', value: counts.queued },
        { label: 'Resolvidos', value: counts.resolved },
        { label: 'Sync falha', value: counts.syncFailed },
      ]
    : [];

  return (
    <View style={styles.page}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.kicker}>SUPORTE / VISÃO GERAL</Text>
          <Text style={styles.title}>Triagem</Text>
          <Text style={styles.lead}>
            Indicadores e atenção imediata. A estação de trabalho da fila está em Atendimentos.
          </Text>
        </View>
        <Link href={CLOUD_ROUTES.suporte.atendimentos} asChild>
          <Pressable style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
            <Text style={styles.primaryButtonText}>Abrir fila</Text>
          </Pressable>
        </Link>
      </View>

      {loading && !overview ? (
        <View style={styles.loading}>
          <ActivityIndicator color={cloudTheme.colors.brand} />
          <Text style={styles.muted}>Carregando triagem...</Text>
        </View>
      ) : null}

      {error ? (
        <View style={styles.errorRow}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable accessibilityRole="button" onPress={() => { void load(); }} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Tentar novamente</Text>
          </Pressable>
        </View>
      ) : null}

      {overview ? (
        <>
          <View style={styles.strip}>
            <StripCell label="Total" value={counts?.total ?? 0} />
            <View style={styles.stripDivider} />
            <StripCell label="Risco SLA" value={counts?.slaAtRisk ?? 0} tone={(counts?.slaAtRisk ?? 0) > 0 ? 'warning' : undefined} />
            <View style={styles.stripDivider} />
            <StripCell label="Críticos" value={counts?.critical ?? 0} tone={(counts?.critical ?? 0) > 0 ? 'danger' : undefined} />
            <View style={styles.stripDivider} />
            <StripCell label="Falhas sync" value={counts?.syncFailed ?? 0} tone={(counts?.syncFailed ?? 0) > 0 ? 'danger' : undefined} />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Atenção imediata</Text>
            {attention.length === 0 ? (
              <Text style={styles.muted}>Nenhum item exige atenção imediata nesta sessão.</Text>
            ) : (
              attention.map((item) => (
                <Link key={item.key} href={item.href as never} asChild>
                  <Pressable style={({ pressed }) => [styles.attentionRow, pressed && styles.pressed]}>
                    <View style={styles.attentionText}>
                      <Text style={styles.attentionLabel}>{item.label}</Text>
                      <Text style={styles.muted} numberOfLines={1}>{item.detail}</Text>
                    </View>
                    <Text style={styles.attentionCta}>Abrir</Text>
                  </Pressable>
                </Link>
              ))
            )}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Distribuição da fila</Text>
            <View style={styles.distribution}>
              {distribution.map((item) => (
                <View key={item.label} style={styles.distCell}>
                  <Text style={styles.distValue}>{item.value.toLocaleString('pt-BR')}</Text>
                  <Text style={styles.distLabel}>{item.label}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Atividade recente</Text>
            {recentActivity.length === 0 ? (
              <Text style={styles.muted}>Sem atividade recente nesta sessão.</Text>
            ) : (
              recentActivity.map((ticket) => (
                <Link
                  key={ticket.id}
                  href={{
                    pathname: CLOUD_ROUTES.suporte.atendimentos,
                    params: { ticketId: ticket.id },
                  }}
                  asChild
                >
                  <Pressable style={({ pressed }) => [styles.activityRow, pressed && styles.pressed]}>
                    <Text style={styles.protocol} numberOfLines={1}>{ticket.protocol}</Text>
                    <Text style={styles.activityStatus} numberOfLines={1}>
                      {statusLabels[ticket.status] ?? ticket.status}
                    </Text>
                    <Text style={styles.activityWhen} numberOfLines={1}>
                      {formatWhen(ticket.lastMessageAt ?? ticket.updatedAt)}
                    </Text>
                  </Pressable>
                </Link>
              ))
            )}
          </View>
        </>
      ) : null}
    </View>
  );
}

function StripCell({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: 'danger' | 'warning';
}) {
  return (
    <View style={styles.stripCell}>
      <Text style={styles.stripLabel}>{label}</Text>
      <Text
        style={[
          styles.stripValue,
          tone === 'danger' && styles.danger,
          tone === 'warning' && styles.warning,
        ]}
      >
        {value.toLocaleString('pt-BR')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    width: '100%',
    maxWidth: cloudTheme.layout.contentMax,
    alignSelf: 'center',
    gap: 22,
    padding: cloudTheme.layout.contentPadding,
  },
  header: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 14,
  },
  headerText: { flex: 1, minWidth: 240, gap: 6 },
  kicker: {
    color: cloudTheme.colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  title: { color: cloudTheme.colors.text, fontSize: 28, fontWeight: '800' },
  lead: { color: cloudTheme.colors.textSecondary, fontSize: 14, lineHeight: 20, maxWidth: 560 },
  loading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  muted: { color: cloudTheme.colors.textSecondary, fontSize: 13, lineHeight: 19 },
  errorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: cloudTheme.colors.danger,
    borderRadius: 6,
    backgroundColor: cloudTheme.colors.dangerSoft,
  },
  errorText: { flex: 1, minWidth: 200, color: cloudTheme.colors.danger },
  strip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderWidth: 1,
    borderColor: cloudTheme.colors.border,
    borderRadius: 6,
    backgroundColor: cloudTheme.colors.surface,
    overflow: 'hidden',
  },
  stripCell: {
    minWidth: 120,
    flexGrow: 1,
    gap: 4,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  stripDivider: { width: 1, backgroundColor: cloudTheme.colors.border },
  stripLabel: { color: cloudTheme.colors.textMuted, fontSize: 11, fontWeight: '700' },
  stripValue: { color: cloudTheme.colors.text, fontSize: 22, fontWeight: '900' },
  danger: { color: cloudTheme.colors.danger },
  warning: { color: '#916421' },
  section: {
    gap: 8,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: cloudTheme.colors.border,
  },
  sectionTitle: { color: cloudTheme.colors.text, fontSize: 16, fontWeight: '800', marginTop: 8 },
  attentionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    minHeight: 48,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: cloudTheme.colors.border,
  },
  attentionText: { flex: 1, minWidth: 0, gap: 2 },
  attentionLabel: { color: cloudTheme.colors.text, fontSize: 14, fontWeight: '700' },
  attentionCta: { color: cloudTheme.colors.brand, fontSize: 12, fontWeight: '800' },
  distribution: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 0,
  },
  distCell: {
    minWidth: 120,
    flexGrow: 1,
    gap: 4,
    paddingVertical: 12,
    paddingRight: 16,
    borderRightWidth: 1,
    borderRightColor: cloudTheme.colors.border,
  },
  distValue: { color: cloudTheme.colors.text, fontSize: 18, fontWeight: '800' },
  distLabel: { color: cloudTheme.colors.textMuted, fontSize: 11, fontWeight: '700' },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 44,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: cloudTheme.colors.border,
  },
  protocol: {
    flex: 1,
    minWidth: 100,
    color: cloudTheme.colors.textMuted,
    fontSize: 12,
    fontFamily: 'monospace',
    fontWeight: '600',
  },
  activityStatus: { flex: 1, minWidth: 100, color: cloudTheme.colors.text, fontSize: 13, fontWeight: '600' },
  activityWhen: { flex: 1.1, minWidth: 120, color: cloudTheme.colors.textSecondary, fontSize: 12 },
  primaryButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderRadius: 6,
    backgroundColor: cloudTheme.colors.brand,
  },
  primaryButtonText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  secondaryButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: cloudTheme.colors.brand,
    borderRadius: 6,
    backgroundColor: cloudTheme.colors.surface,
  },
  secondaryButtonText: { color: cloudTheme.colors.brand, fontWeight: '800', fontSize: 13 },
  pressed: { opacity: 0.88 },
});
