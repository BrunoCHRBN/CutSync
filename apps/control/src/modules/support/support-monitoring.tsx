import { Link, useFocusEffect } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { CLOUD_ROUTES } from '@/navigation/cloud-routes';
import { useControlAuth } from '@/contexts/control-auth-context';
import {
  ControlSupportError,
  getControlSupportOverview,
  type SupportOverview,
  type SupportTicketSummary,
} from '@/services/control-support';
import { cloudTheme } from '@/theme/cloud-components';

function loadErrorMessage(error: unknown): string {
  if (!(error instanceof ControlSupportError)) {
    return 'Não foi possível carregar o monitoramento de sync.';
  }
  if (error.code === 'forbidden') return 'Seu acesso atual não permite consultar o monitoramento.';
  if (error.code === 'aal2_required') return 'Confirme o autenticador para continuar.';
  return 'O monitoramento está temporariamente indisponível.';
}

function isSyncIssue(ticket: SupportTicketSummary): boolean {
  return ticket.syncStatus !== 'synced' || ticket.status === 'sync_failed';
}

function formatWhen(value: string | null): string {
  return value ? new Date(value).toLocaleString('pt-BR') : '—';
}

export function SupportMonitoringScreen() {
  const { can } = useControlAuth();
  const [overview, setOverview] = useState<SupportOverview | null>(null);
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
        limit: 40,
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

  const capabilities = overview?.capabilities;
  const syncIssues = (overview?.tickets ?? []).filter(isSyncIssue);

  return (
    <View style={styles.page}>
      <View style={styles.header}>
        <Text style={styles.kicker}>SUPORTE / MONITORAMENTO</Text>
        <Text style={styles.title}>Monitoramento</Text>
        <Text style={styles.lead}>
          Saúde técnica da sincronização JSM a partir da overview real. Sem histórico inventado de ciclos.
        </Text>
      </View>

      {loading && !overview ? (
        <View style={styles.loading}>
          <ActivityIndicator color={cloudTheme.colors.brand} />
          <Text style={styles.muted}>Carregando monitoramento...</Text>
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
            <View style={styles.stripCell}>
              <Text style={styles.stripLabel}>Módulo</Text>
              <Text style={styles.stripValue}>{capabilities?.enabled ? 'Ativo' : 'Pausado'}</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.stripCell}>
              <Text style={styles.stripLabel}>Sync</Text>
              <Text style={styles.stripValue}>{capabilities?.syncEnabled ? 'Ativa' : 'Pausada'}</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.stripCell}>
              <Text style={styles.stripLabel}>Novos chamados</Text>
              <Text style={styles.stripValue}>{capabilities?.allowNewTickets ? 'Liberados' : 'Bloqueados'}</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.stripCell}>
              <Text style={styles.stripLabel}>Falhas de sync</Text>
              <Text style={[
                styles.stripValue,
                (overview.counts.syncFailed ?? 0) > 0 && styles.danger,
              ]}
              >
                {(overview.counts.syncFailed ?? 0).toLocaleString('pt-BR')}
              </Text>
            </View>
          </View>

          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>Chamados com sync irregular</Text>
            <Link
              href={{ pathname: CLOUD_ROUTES.suporte.atendimentos, params: { status: 'sync_failed' } }}
              asChild
            >
              <Pressable accessibilityRole="link" style={styles.linkButton}>
                <Text style={styles.linkButtonText}>Falhas de sync na fila</Text>
              </Pressable>
            </Link>
          </View>

          <View style={styles.table}>
            <View style={styles.tableHead}>
              <Text style={[styles.headCell, styles.colProtocol]}>Protocolo</Text>
              <Text style={[styles.headCell, styles.colClient]}>Cliente</Text>
              <Text style={[styles.headCell, styles.colSync]}>Sync</Text>
              <Text style={[styles.headCell, styles.colStatus]}>Status</Text>
              <Text style={[styles.headCell, styles.colWhen]}>Atualizado</Text>
            </View>
            {syncIssues.map((ticket) => (
              <Link
                key={ticket.id}
                href={{
                  pathname: '/suporte/atendimentos/[ticketId]',
                  params: { ticketId: ticket.id },
                }}
                asChild
              >
                <Pressable style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
                  <Text style={[styles.protocol, styles.colProtocol]} numberOfLines={1}>{ticket.protocol}</Text>
                  <Text style={[styles.cell, styles.colClient]} numberOfLines={1}>
                    {ticket.requesterDisplayName ?? ticket.locationLabel ?? '—'}
                  </Text>
                  <Text style={[styles.cell, styles.colSync]} numberOfLines={1}>{ticket.syncStatus}</Text>
                  <Text style={[styles.cell, styles.colStatus]} numberOfLines={1}>{ticket.status}</Text>
                  <Text style={[styles.cell, styles.colWhen]} numberOfLines={1}>
                    {formatWhen(ticket.updatedAt)}
                  </Text>
                </Pressable>
              </Link>
            ))}
            {!loading && syncIssues.length === 0 ? (
              <View style={styles.emptyRow}>
                <Text style={styles.muted}>Nenhum chamado com sync irregular na página atual da overview.</Text>
              </View>
            ) : null}
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    width: '100%',
    maxWidth: 1100,
    alignSelf: 'center',
    gap: 18,
    padding: cloudTheme.layout.contentPadding,
  },
  header: { gap: 6 },
  kicker: {
    color: cloudTheme.colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  title: { color: cloudTheme.colors.text, fontSize: 26, fontWeight: '800' },
  lead: { color: cloudTheme.colors.textSecondary, fontSize: 14, lineHeight: 20, maxWidth: 680 },
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
    alignItems: 'stretch',
    gap: 0,
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
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  stripLabel: { color: cloudTheme.colors.textMuted, fontSize: 11, fontWeight: '700' },
  stripValue: { color: cloudTheme.colors.text, fontSize: 15, fontWeight: '800' },
  danger: { color: cloudTheme.colors.danger },
  divider: { width: 1, backgroundColor: cloudTheme.colors.border },
  sectionHead: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  sectionTitle: { color: cloudTheme.colors.text, fontSize: 16, fontWeight: '800' },
  linkButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  linkButtonText: { color: cloudTheme.colors.brand, fontSize: 13, fontWeight: '800' },
  table: {
    borderWidth: 1,
    borderColor: cloudTheme.colors.border,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: cloudTheme.colors.surface,
  },
  tableHead: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: cloudTheme.colors.border,
    backgroundColor: cloudTheme.colors.canvas,
  },
  headCell: { color: cloudTheme.colors.textMuted, fontSize: 11, fontWeight: '800' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: cloudTheme.colors.border,
  },
  emptyRow: { padding: 16 },
  protocol: {
    color: cloudTheme.colors.textMuted,
    fontSize: 12,
    fontFamily: 'monospace',
    fontWeight: '600',
  },
  cell: { color: cloudTheme.colors.text, fontSize: 13 },
  colProtocol: { flex: 1, minWidth: 100 },
  colClient: { flex: 1.3, minWidth: 120 },
  colSync: { flex: 0.9, minWidth: 90 },
  colStatus: { flex: 0.9, minWidth: 90 },
  colWhen: { flex: 1.1, minWidth: 120 },
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
