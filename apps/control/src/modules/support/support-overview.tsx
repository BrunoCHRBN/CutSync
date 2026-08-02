import { Link, useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import { useControlAuth } from '@/contexts/control-auth-context';
import { resolveCloudActionAvailability } from '@/features/cloud/cloud-action-availability';
import { CLOUD_ROUTES } from '@/navigation/cloud-routes';
import {
  ControlSupportError,
  getControlSupportOverview,
  type SupportOverview as SupportOverviewData,
  type SupportPriority,
  type SupportTicketSummary,
} from '@/services/control-support';
import { cloudTheme } from '@/theme/cloud-components';

const priorityLabels: Record<SupportPriority, string> = {
  critical: 'Crítica',
  high: 'Alta',
  normal: 'Normal',
  low: 'Baixa',
};

const priorityRank: Record<SupportPriority, number> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
};

const categoryLabels: Record<string, string> = {
  access_identity: 'Acesso',
  booking: 'Agendamento',
  business_operations: 'Operação',
  billing: 'Cobrança',
  marketplace: 'Marketplace',
  security_privacy: 'Segurança',
  platform_incident: 'Incidente',
  product_feedback: 'Produto',
  other: 'Outros',
};

const statusLabels: Record<string, string> = {
  queued: 'Na fila',
  open: 'Aberto',
  in_progress: 'Em andamento',
  waiting_user: 'Aguardando usuário',
  resolved: 'Resolvido',
  closed: 'Fechado',
  sync_failed: 'Falha de sync',
};

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

function isSlaNear(ticket: SupportTicketSummary): boolean {
  if (!ticket.firstResponseDueAt || ticket.firstRespondedAt) return false;
  const due = Date.parse(ticket.firstResponseDueAt);
  const now = Date.now();
  if (Number.isNaN(due) || due <= now) return false;
  return due - now <= 2 * 60 * 60 * 1000;
}

function needsAttention(ticket: SupportTicketSummary): boolean {
  return (
    ticket.priority === 'critical'
    || ticket.priority === 'high'
    || isSlaAtRisk(ticket)
    || isSlaNear(ticket)
    || ticket.status === 'sync_failed'
  );
}

function attentionSortKey(ticket: SupportTicketSummary): number[] {
  return [
    ticket.priority === 'critical' ? 0 : 1,
    isSlaAtRisk(ticket) ? 0 : 1,
    isSlaNear(ticket) ? 0 : 1,
    priorityRank[ticket.priority],
    Date.parse(ticket.createdAt) || 0,
  ];
}

function formatRelativeFrom(timestamp: number, now = Date.now()): string {
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (seconds < 45) return 'agora';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `há ${hours} h`;
  const days = Math.floor(hours / 24);
  return `há ${days} d`;
}

function formatActivityWhen(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const day = date
    .toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
    .replace('.', '')
    .replace(' de ', ' ');
  const time = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return `${day} · ${time}`;
}

function activityEvent(ticket: SupportTicketSummary): string {
  if (ticket.status === 'resolved' || ticket.status === 'closed') return 'Resolvido';
  if (ticket.status === 'sync_failed') return 'Falha de sync';
  const created = Date.parse(ticket.createdAt);
  const updated = Date.parse(ticket.updatedAt);
  if (!Number.isNaN(created) && !Number.isNaN(updated) && Math.abs(updated - created) < 90_000) {
    return 'Criado';
  }
  if (ticket.lastMessageAt) return 'Mensagem';
  return 'Atualizado';
}

function slaLabel(ticket: SupportTicketSummary): string {
  if (isSlaAtRisk(ticket)) return 'Fora do SLA';
  if (isSlaNear(ticket)) return 'Próximo';
  return 'No prazo';
}

function assigneeLabel(ticket: SupportTicketSummary): string {
  return ticket.assigneeProfileId ? ticket.assigneeProfileId.slice(0, 8) : '—';
}

function reasonLabel(ticket: SupportTicketSummary): string {
  const category = categoryLabels[ticket.category] ?? ticket.category;
  return `${ticket.subject} · ${category}`;
}

function scrollParentToTop(node: View | null) {
  if (Platform.OS !== 'web' || !node) return;
  const element = node as unknown as { parentElement?: HTMLElement | null };
  let parent = element.parentElement ?? null;
  while (parent) {
    const style = globalThis.getComputedStyle?.(parent);
    const overflowY = style?.overflowY;
    if (overflowY === 'auto' || overflowY === 'scroll') {
      parent.scrollTop = 0;
      return;
    }
    parent = parent.parentElement;
  }
  globalThis.scrollTo?.(0, 0);
}

export function SupportOverviewScreen() {
  const { can } = useControlAuth();
  const { width } = useWindowDimensions();
  const compact = width < 960;
  const pageRef = useRef<View>(null);
  const [overview, setOverview] = useState<SupportOverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [loadedAt, setLoadedAt] = useState<number | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());
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
      if (id === requestId.current) {
        setOverview(result);
        setLoadedAt(Date.now());
      }
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
    const frame = requestAnimationFrame(() => scrollParentToTop(pageRef.current));
    const timer = setInterval(() => setNowTick(Date.now()), 30_000);
    return () => {
      requestId.current += 1;
      cancelAnimationFrame(frame);
      clearInterval(timer);
    };
  }, [can, load]));

  React.useEffect(() => {
    if (!loading) {
      const frame = requestAnimationFrame(() => scrollParentToTop(pageRef.current));
      return () => cancelAnimationFrame(frame);
    }
    return undefined;
  }, [loading, overview]);

  const counts = overview?.counts;
  const capabilities = overview?.capabilities;

  const attentionTickets = useMemo(() => {
    if (!overview?.tickets.length) return [];
    return [...overview.tickets]
      .filter(needsAttention)
      .sort((a, b) => {
        const aKey = attentionSortKey(a);
        const bKey = attentionSortKey(b);
        for (let index = 0; index < aKey.length; index += 1) {
          if (aKey[index] !== bKey[index]) return aKey[index]! - bKey[index]!;
        }
        return 0;
      })
      .slice(0, 8);
  }, [overview]);

  const recentActivity = useMemo(() => {
    if (!overview?.tickets.length) return [];
    return [...overview.tickets]
      .sort((a, b) => {
        const aAt = Date.parse(a.lastMessageAt ?? a.updatedAt);
        const bAt = Date.parse(b.lastMessageAt ?? b.updatedAt);
        return bAt - aAt;
      })
      .slice(0, 5);
  }, [overview]);

  const distribution = useMemo(() => {
    if (!counts) return [];
    return [
      { label: 'Aberto', value: counts.open },
      { label: 'Resolvido', value: counts.resolved },
      { label: 'Em andamento', value: counts.inProgress },
      { label: 'Aguardando usuário', value: counts.waitingUser },
      { label: 'Na fila', value: counts.queued },
      { label: 'Falha de sincronização', value: counts.syncFailed },
    ];
  }, [counts]);

  const distributionMax = Math.max(1, ...distribution.map((item) => item.value));

  const createTicket = resolveCloudActionAvailability({
    action: 'create_support_ticket',
    can,
    allowNewTickets: capabilities?.allowNewTickets ?? false,
  });

  const jsmLabel = (() => {
    if (!capabilities) return 'Indisponível';
    if (!capabilities.enabled) return 'Pausado';
    if (!capabilities.syncEnabled) return 'Sync pausada';
    if ((counts?.syncFailed ?? 0) > 0) return 'Com falhas';
    return '● Operacional';
  })();

  const lastSyncLabel = useMemo(() => {
    if (!overview?.tickets.length) return 'Sem ciclo nesta sessão';
    const synced = overview.tickets
      .filter((ticket) => ticket.syncStatus === 'synced')
      .map((ticket) => Date.parse(ticket.updatedAt))
      .filter((value) => !Number.isNaN(value));
    if (!synced.length) {
      const newest = Math.max(...overview.tickets.map((ticket) => Date.parse(ticket.updatedAt)));
      if (Number.isNaN(newest)) return 'Sem ciclo nesta sessão';
      return `atividade ${formatRelativeFrom(newest, nowTick)}`;
    }
    return formatRelativeFrom(Math.max(...synced), nowTick);
  }, [nowTick, overview]);

  const updatedLabel = loadedAt
    ? `Atualizado ${formatRelativeFrom(loadedAt, nowTick)}`
    : 'Aguardando dados';

  const slaShare = counts && counts.total > 0
    ? Math.round((counts.slaAtRisk / counts.total) * 100)
    : null;

  return (
    <View ref={pageRef} style={styles.page} collapsable={false}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.kicker}>SUPORTE / VISÃO GERAL</Text>
          <Text style={styles.title}>Triagem</Text>
          <Text style={styles.lead}>
            Acompanhe os atendimentos que exigem ação e o estado da operação.
          </Text>
        </View>
        <View style={styles.headerActions}>
          <Text style={styles.updatedLabel}>{updatedLabel}</Text>
          <Pressable
            accessibilityRole="button"
            disabled={loading}
            onPress={() => { void load(); }}
            style={({ pressed }) => [
              styles.textAction,
              loading && styles.disabled,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.textActionLabel}>Atualizar</Text>
          </Pressable>
          <Link href={CLOUD_ROUTES.suporte.atendimentos} asChild>
            <Pressable style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
              <Text style={styles.primaryButtonText}>Abrir fila</Text>
            </Pressable>
          </Link>
        </View>
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
            <StripCell
              label="Risco de SLA"
              value={counts?.slaAtRisk ?? 0}
              tone={(counts?.slaAtRisk ?? 0) > 0 ? 'warning' : undefined}
              detail={slaShare !== null ? `${slaShare}% da fila` : undefined}
            />
            <View style={styles.stripDivider} />
            <StripCell
              label="Críticos"
              value={counts?.critical ?? 0}
              tone={(counts?.critical ?? 0) > 0 ? 'danger' : undefined}
            />
            <View style={styles.stripDivider} />
            <StripCell
              label="Falhas de sync"
              value={counts?.syncFailed ?? 0}
              tone={(counts?.syncFailed ?? 0) > 0 ? 'danger' : undefined}
            />
            <View style={styles.stripDivider} />
            <View style={styles.stripCell}>
              <Text style={styles.stripLabel}>JSM</Text>
              <Text style={styles.stripStatus}>{jsmLabel}</Text>
            </View>
          </View>

          <View style={[styles.grid, compact && styles.gridCompact]}>
            <View style={styles.mainCol}>
              <View style={styles.panel}>
                <View style={styles.panelHead}>
                  <Text style={styles.sectionTitle}>Atenção imediata</Text>
                  <Text style={styles.panelMeta}>
                    {attentionTickets.length} {attentionTickets.length === 1 ? 'item' : 'itens'}
                  </Text>
                </View>
                {attentionTickets.length === 0 ? (
                  <Text style={styles.muted}>Nenhum atendimento exige atenção imediata nesta sessão.</Text>
                ) : (
                  <View style={styles.table}>
                    <View style={styles.tableHead}>
                      <Text style={[styles.headCell, styles.colProtocol]}>Chamado</Text>
                      <Text style={[styles.headCell, styles.colReason]}>Motivo</Text>
                      <Text style={[styles.headCell, styles.colPri]}>Prioridade</Text>
                      <Text style={[styles.headCell, styles.colSla]}>SLA</Text>
                      <Text style={[styles.headCell, styles.colOwner]}>Responsável</Text>
                      <Text style={[styles.headCell, styles.colArrow]} />
                    </View>
                    {attentionTickets.map((ticket) => {
                      const slaRisk = isSlaAtRisk(ticket);
                      return (
                        <Link
                          key={ticket.id}
                          href={{
                            pathname: CLOUD_ROUTES.suporte.atendimentos,
                            params: { ticketId: ticket.id },
                          }}
                          asChild
                        >
                          <Pressable
                            style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
                              styles.tableRow,
                              slaRisk && styles.tableRowSla,
                              (pressed || hovered) && styles.tableRowHover,
                            ]}
                          >
                            <Text style={[styles.protocol, styles.colProtocol]} numberOfLines={1}>
                              {ticket.protocol}
                            </Text>
                            <Text style={[styles.cell, styles.colReason]} numberOfLines={1}>
                              {reasonLabel(ticket)}
                            </Text>
                            <Text
                              style={[
                                styles.priTag,
                                styles.colPri,
                                styles[`pri_${ticket.priority}`],
                              ]}
                              numberOfLines={1}
                            >
                              {priorityLabels[ticket.priority]}
                            </Text>
                            <Text
                              style={[
                                styles.cell,
                                styles.colSla,
                                slaRisk && styles.warning,
                                isSlaNear(ticket) && !slaRisk && styles.warning,
                              ]}
                              numberOfLines={1}
                            >
                              {slaLabel(ticket)}
                            </Text>
                            <Text style={[styles.mono, styles.colOwner]} numberOfLines={1}>
                              {assigneeLabel(ticket)}
                            </Text>
                            <Text style={[styles.arrow, styles.colArrow]}>→</Text>
                          </Pressable>
                        </Link>
                      );
                    })}
                  </View>
                )}
              </View>

              <View style={styles.panel}>
                <View style={styles.panelHead}>
                  <Text style={styles.sectionTitle}>Atividade recente</Text>
                  <Link href={CLOUD_ROUTES.suporte.atendimentos} asChild>
                    <Pressable style={styles.textAction}>
                      <Text style={styles.textActionLabel}>Ver histórico completo</Text>
                    </Pressable>
                  </Link>
                </View>
                {recentActivity.length === 0 ? (
                  <Text style={styles.muted}>Sem atividade recente nesta sessão.</Text>
                ) : (
                  <View style={styles.table}>
                    <View style={styles.tableHead}>
                      <Text style={[styles.headCell, styles.colWhen]}>Data e hora</Text>
                      <Text style={[styles.headCell, styles.colProtocol]}>Chamado</Text>
                      <Text style={[styles.headCell, styles.colEvent]}>Evento</Text>
                      <Text style={[styles.headCell, styles.colStatus]}>Status</Text>
                    </View>
                    {recentActivity.map((ticket) => (
                      <Link
                        key={ticket.id}
                        href={{
                          pathname: CLOUD_ROUTES.suporte.atendimentos,
                          params: { ticketId: ticket.id },
                        }}
                        asChild
                      >
                        <Pressable
                          style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
                            styles.tableRow,
                            (pressed || hovered) && styles.tableRowHover,
                          ]}
                        >
                          <Text style={[styles.whenCell, styles.colWhen]} numberOfLines={1}>
                            {formatActivityWhen(ticket.lastMessageAt ?? ticket.updatedAt)}
                          </Text>
                          <Text style={[styles.protocol, styles.colProtocol]} numberOfLines={1}>
                            {ticket.protocol}
                          </Text>
                          <Text style={[styles.cellStrong, styles.colEvent]} numberOfLines={1}>
                            {activityEvent(ticket)}
                          </Text>
                          <Text style={[styles.cell, styles.colStatus]} numberOfLines={1}>
                            {statusLabels[ticket.status] ?? ticket.status}
                          </Text>
                        </Pressable>
                      </Link>
                    ))}
                  </View>
                )}
              </View>
            </View>

            <View style={styles.sideCol}>
              <View style={styles.panel}>
                <Text style={styles.sectionTitle}>Distribuição da fila</Text>
                <View style={styles.distList}>
                  {distribution.map((item) => {
                    const ratio = item.value / distributionMax;
                    return (
                      <View key={item.label} style={styles.distRow}>
                        <View style={styles.distMeta}>
                          <Text style={[styles.distLabel, item.value === 0 && styles.distZero]}>
                            {item.label}
                          </Text>
                          <Text style={[styles.distValue, item.value === 0 && styles.distZero]}>
                            {item.value.toLocaleString('pt-BR')}
                          </Text>
                        </View>
                        <View style={styles.distTrack}>
                          <View
                            style={[
                              styles.distBar,
                              {
                                width: `${Math.max(item.value > 0 ? 8 : 0, Math.round(ratio * 100))}%`,
                                opacity: item.value === 0 ? 0 : 1,
                              },
                            ]}
                          />
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>

              <View style={styles.panel}>
                <Text style={styles.sectionTitle}>Saúde do suporte</Text>
                <View style={styles.healthList}>
                  <HealthRow
                    label="Runtime"
                    value={capabilities?.enabled ? 'Ativo' : 'Pausado'}
                  />
                  <HealthRow
                    label="Sincronização JSM"
                    value={
                      !capabilities
                        ? 'Indisponível'
                        : !capabilities.syncEnabled
                          ? 'Pausada'
                          : (counts?.syncFailed ?? 0) > 0
                            ? 'Com falhas'
                            : 'Operacional'
                    }
                  />
                  <HealthRow label="Última sincronização" value={lastSyncLabel} />
                  <HealthRow
                    label="Novos atendimentos"
                    value={
                      createTicket.enabled
                        ? 'Liberados'
                        : (createTicket.reason?.includes('homologação')
                          ? 'Em homologação'
                          : (createTicket.visible ? 'Bloqueados' : 'Sem permissão'))
                    }
                  />
                  <HealthRow label="Projeção" value="JSM" />
                </View>
              </View>
            </View>
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
  detail,
}: {
  label: string;
  value: number;
  tone?: 'danger' | 'warning';
  detail?: string;
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
      {detail ? <Text style={styles.stripDetail}>{detail}</Text> : null}
    </View>
  );
}

function HealthRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.healthRow}>
      <Text style={styles.healthLabel}>{label}</Text>
      <Text style={styles.healthValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    width: '100%',
    maxWidth: 1360,
    alignSelf: 'center',
    gap: 20,
    paddingHorizontal: 32,
    paddingVertical: cloudTheme.layout.contentPadding,
  },
  header: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 16,
  },
  headerText: { flex: 1, minWidth: 280, gap: 6 },
  headerActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 12,
  },
  kicker: {
    color: cloudTheme.colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  title: { color: cloudTheme.colors.text, fontSize: 27, fontWeight: '800' },
  lead: { color: cloudTheme.colors.textSecondary, fontSize: 14, lineHeight: 20, maxWidth: 560 },
  updatedLabel: { color: cloudTheme.colors.textMuted, fontSize: 12, fontWeight: '600' },
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
    borderRadius: 4,
    backgroundColor: cloudTheme.colors.dangerSoft,
  },
  errorText: { flex: 1, minWidth: 200, color: cloudTheme.colors.danger },
  strip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'stretch',
    minHeight: 76,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: cloudTheme.colors.border,
    backgroundColor: cloudTheme.colors.surface,
  },
  stripCell: {
    minWidth: 110,
    flexGrow: 1,
    gap: 2,
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  stripDivider: { width: 1, backgroundColor: cloudTheme.colors.border },
  stripLabel: {
    color: cloudTheme.colors.textMuted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  stripValue: { color: cloudTheme.colors.text, fontSize: 21, fontWeight: '900' },
  stripDetail: { color: cloudTheme.colors.textMuted, fontSize: 11, fontWeight: '600' },
  stripStatus: { color: cloudTheme.colors.text, fontSize: 15, fontWeight: '800' },
  danger: { color: cloudTheme.colors.danger },
  warning: { color: '#9A6B1F' },
  grid: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 32,
  },
  gridCompact: {
    flexDirection: 'column',
    gap: 20,
  },
  mainCol: {
    flexGrow: 2,
    flexShrink: 1,
    flexBasis: '0%',
    minWidth: 0,
    gap: 20,
  },
  sideCol: {
    width: 340,
    maxWidth: '100%',
    flexShrink: 0,
    gap: 20,
  },
  panel: {
    gap: 10,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: cloudTheme.colors.border,
  },
  panelHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 4,
  },
  sectionTitle: {
    color: cloudTheme.colors.text,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },
  panelMeta: { color: cloudTheme.colors.textMuted, fontSize: 12, fontWeight: '700' },
  table: {
    borderTopWidth: 1,
    borderTopColor: cloudTheme.colors.border,
  },
  tableHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: cloudTheme.colors.border,
  },
  headCell: {
    color: cloudTheme.colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: cloudTheme.colors.border,
  },
  tableRowSla: {
    borderLeftWidth: 3,
    borderLeftColor: '#C9892F',
    paddingLeft: 8,
    marginLeft: -8,
  },
  tableRowHover: { backgroundColor: '#F5F8F5' },
  protocol: {
    color: cloudTheme.colors.textMuted,
    fontSize: 12,
    fontFamily: 'monospace',
    fontWeight: '600',
  },
  mono: {
    color: cloudTheme.colors.textSecondary,
    fontSize: 12,
    fontFamily: 'monospace',
    fontWeight: '600',
  },
  cell: { color: cloudTheme.colors.textSecondary, fontSize: 13 },
  cellStrong: { color: cloudTheme.colors.text, fontSize: 13, fontWeight: '700' },
  whenCell: {
    color: cloudTheme.colors.textSecondary,
    fontSize: 12,
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
  },
  priTag: {
    fontSize: 11,
    fontWeight: '800',
  },
  pri_critical: { color: cloudTheme.colors.danger },
  pri_high: { color: '#9A6B1F' },
  pri_normal: { color: cloudTheme.colors.text },
  pri_low: { color: cloudTheme.colors.textMuted },
  arrow: { color: cloudTheme.colors.textMuted, fontSize: 14, fontWeight: '700', textAlign: 'right' },
  colProtocol: { flex: 1.1, minWidth: 108 },
  colReason: { flex: 1.6, minWidth: 140 },
  colPri: { flex: 0.7, minWidth: 72 },
  colSla: { flex: 0.85, minWidth: 84 },
  colOwner: { flex: 0.8, minWidth: 72 },
  colArrow: { width: 18, flexGrow: 0 },
  colWhen: { flex: 1.1, minWidth: 120 },
  colEvent: { flex: 0.9, minWidth: 88 },
  colStatus: { flex: 0.9, minWidth: 96 },
  distList: { gap: 10 },
  distRow: { gap: 4 },
  distMeta: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
  },
  distLabel: { color: cloudTheme.colors.text, fontSize: 13, fontWeight: '600', flex: 1 },
  distValue: { color: cloudTheme.colors.text, fontSize: 13, fontWeight: '800' },
  distZero: { color: cloudTheme.colors.textMuted, fontWeight: '500' },
  distTrack: {
    height: 6,
    borderRadius: 2,
    backgroundColor: '#EEF1EE',
    overflow: 'hidden',
  },
  distBar: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: cloudTheme.colors.brand,
  },
  healthList: {
    borderTopWidth: 1,
    borderTopColor: cloudTheme.colors.border,
  },
  healthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    minHeight: 40,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: cloudTheme.colors.border,
  },
  healthLabel: { color: cloudTheme.colors.textMuted, fontSize: 12, fontWeight: '700' },
  healthValue: { color: cloudTheme.colors.text, fontSize: 13, fontWeight: '700', textAlign: 'right' },
  primaryButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderRadius: 4,
    backgroundColor: '#1F6B45',
  },
  primaryButtonText: { color: '#FFFFFF', fontWeight: '800', fontSize: 13 },
  secondaryButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: cloudTheme.colors.brand,
    borderRadius: 4,
    backgroundColor: cloudTheme.colors.surface,
  },
  secondaryButtonText: { color: cloudTheme.colors.brand, fontWeight: '800', fontSize: 13 },
  textAction: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  textActionLabel: { color: '#1F6B45', fontSize: 13, fontWeight: '800' },
  pressed: { opacity: 0.88 },
  disabled: { opacity: 0.5 },
});
