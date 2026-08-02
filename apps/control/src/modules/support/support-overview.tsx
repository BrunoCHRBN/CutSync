import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
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

/** Web grid keeps header/row cells on one line; RN Web Link/asChild was stacking children. */
const attentionGridStyle = Platform.select<ViewStyle>({
  web: {
    display: 'grid' as ViewStyle['display'],
    // @ts-expect-error RN web grid
    gridTemplateColumns: 'minmax(150px, 1.1fr) minmax(260px, 2fr) 100px 120px 130px 28px',
    alignItems: 'center',
    columnGap: 12,
    width: '100%',
  },
  default: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    width: '100%',
  },
});

const activityGridStyle = Platform.select<ViewStyle>({
  web: {
    display: 'grid' as ViewStyle['display'],
    // @ts-expect-error RN web grid
    gridTemplateColumns: '140px minmax(180px, 1fr) minmax(180px, 1.4fr) 110px',
    alignItems: 'center',
    columnGap: 12,
    width: '100%',
  },
  default: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    width: '100%',
  },
});

const tabularNums: TextStyle = Platform.select({
  web: { fontVariant: ['tabular-nums'] },
  default: {},
}) ?? {};

export function SupportOverviewScreen() {
  const router = useRouter();
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

  const attentionMeta = useMemo(() => {
    const slaCount = attentionTickets.filter(isSlaAtRisk).length;
    const highCount = attentionTickets.filter((ticket) => (
      ticket.priority === 'critical' || ticket.priority === 'high'
    )).length;
    const parts: string[] = [];
    if (slaCount > 0) parts.push(`${slaCount} fora do SLA`);
    if (highCount > 0) parts.push(`${highCount} de alta prioridade`);
    return parts.join(' · ');
  }, [attentionTickets]);

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
      return formatRelativeFrom(newest, nowTick);
    }
    return formatRelativeFrom(Math.max(...synced), nowTick);
  }, [nowTick, overview]);

  const updatedLabel = loadedAt
    ? `Atualizado ${formatRelativeFrom(loadedAt, nowTick)}`
    : 'Aguardando dados';

  const slaShare = counts && counts.total > 0
    ? Math.round((counts.slaAtRisk / counts.total) * 100)
    : null;

  const openQueue = () => {
    router.push(CLOUD_ROUTES.suporte.atendimentos);
  };

  const openTicket = (ticketId: string) => {
    router.push({
      pathname: '/suporte/atendimentos/[ticketId]',
      params: { ticketId },
    });
  };

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
              styles.secondaryButton,
              loading && styles.disabled,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.secondaryButtonText}>Atualizar</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Abrir fila de atendimentos"
            onPress={openQueue}
            style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
          >
            <Text style={styles.primaryButtonText}>Abrir fila</Text>
          </Pressable>
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
              detail={slaShare !== null && (counts?.slaAtRisk ?? 0) > 0 ? `${slaShare}% da fila` : undefined}
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
                  <View style={styles.panelTitleBlock}>
                    <Text style={styles.sectionTitle}>Atenção imediata</Text>
                    {attentionMeta ? <Text style={styles.panelSubmeta}>{attentionMeta}</Text> : null}
                  </View>
                  <Text style={styles.panelMeta}>
                    {attentionTickets.length} {attentionTickets.length === 1 ? 'item' : 'itens'}
                  </Text>
                </View>
                {attentionTickets.length === 0 ? (
                  <Text style={styles.muted}>Nenhum atendimento exige atenção imediata nesta sessão.</Text>
                ) : (
                  <View style={styles.table}>
                    <View style={[styles.tableHead, attentionGridStyle]}>
                      <Text style={styles.headCell}>Chamado</Text>
                      <Text style={styles.headCell}>Motivo</Text>
                      <Text style={styles.headCell}>Prioridade</Text>
                      <Text style={styles.headCell}>SLA</Text>
                      <Text style={styles.headCell}>Responsável</Text>
                      <Text style={styles.headCell} />
                    </View>
                    {attentionTickets.map((ticket) => {
                      const slaRisk = isSlaAtRisk(ticket);
                      return (
                        <Pressable
                          key={ticket.id}
                          accessibilityRole="link"
                          accessibilityLabel={`Abrir chamado ${ticket.protocol}`}
                          onPress={() => openTicket(ticket.id)}
                          style={({ pressed }) => [
                            styles.tableRow,
                            attentionGridStyle,
                            slaRisk && styles.tableRowSla,
                            pressed && styles.tableRowHover,
                          ]}
                        >
                          <Text style={styles.protocol} numberOfLines={1}>
                            {ticket.protocol}
                          </Text>
                          <Text style={styles.cell} numberOfLines={2}>
                            {reasonLabel(ticket)}
                          </Text>
                          <Text
                            style={[styles.priTag, styles[`pri_${ticket.priority}`] as StyleProp<TextStyle>]}
                            numberOfLines={1}
                          >
                            {priorityLabels[ticket.priority]}
                          </Text>
                          <Text
                            style={[
                              styles.cell,
                              slaRisk && styles.warning,
                              isSlaNear(ticket) && !slaRisk && styles.warning,
                            ]}
                            numberOfLines={1}
                          >
                            {slaLabel(ticket)}
                          </Text>
                          <Text style={styles.mono} numberOfLines={1}>
                            {assigneeLabel(ticket)}
                          </Text>
                          <Text style={styles.arrow}>→</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </View>

              <View style={styles.panel}>
                <View style={styles.panelHead}>
                  <Text style={styles.sectionTitle}>Atividade recente</Text>
                  <Pressable
                    accessibilityRole="link"
                    onPress={openQueue}
                    style={styles.textAction}
                  >
                    <Text style={styles.textActionLabel}>Ver histórico completo →</Text>
                  </Pressable>
                </View>
                {recentActivity.length === 0 ? (
                  <Text style={styles.muted}>Sem atividade recente nesta sessão.</Text>
                ) : (
                  <View style={styles.table}>
                    <View style={[styles.tableHead, activityGridStyle]}>
                      <Text style={styles.headCell}>Data e hora</Text>
                      <Text style={styles.headCell}>Chamado</Text>
                      <Text style={styles.headCell}>Evento</Text>
                      <Text style={styles.headCell}>Status</Text>
                    </View>
                    {recentActivity.map((ticket) => (
                      <Pressable
                        key={ticket.id}
                        accessibilityRole="link"
                        accessibilityLabel={`Abrir chamado ${ticket.protocol}`}
                        onPress={() => openTicket(ticket.id)}
                        style={({ pressed }) => [
                          styles.tableRow,
                          activityGridStyle,
                          pressed && styles.tableRowHover,
                        ]}
                      >
                        <Text style={styles.whenCell} numberOfLines={1}>
                          {formatActivityWhen(ticket.lastMessageAt ?? ticket.updatedAt)}
                        </Text>
                        <Text style={styles.protocol} numberOfLines={1}>
                          {ticket.protocol}
                        </Text>
                        <Text style={styles.cellStrong} numberOfLines={1}>
                          {activityEvent(ticket)}
                        </Text>
                        <Text style={styles.cell} numberOfLines={1}>
                          {statusLabels[ticket.status] ?? ticket.status}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>
            </View>

            <View style={[styles.sideCol, !compact && styles.sideColSticky]}>
              <View style={styles.panel}>
                <Text style={styles.sectionTitle}>Distribuição da fila</Text>
                <View style={styles.distList}>
                  {distribution.map((item) => {
                    const ratio = item.value / distributionMax;
                    const barWidth = item.value > 0
                      ? `${Math.max(6, Math.round(ratio * 100))}%`
                      : '0%';
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
                        {item.value > 0 ? (
                          <View style={styles.distTrack}>
                            <View style={[styles.distBar, { width: barWidth as `${number}%` }]} />
                          </View>
                        ) : (
                          <View style={styles.distTrackEmpty} />
                        )}
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
                    tone={
                      !createTicket.enabled && createTicket.reason?.includes('homologação')
                        ? 'caution'
                        : undefined
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
      <View style={styles.stripValueRow}>
        <Text
          style={[
            styles.stripValue,
            tone === 'danger' && styles.danger,
            tone === 'warning' && styles.warning,
          ]}
        >
          {value.toLocaleString('pt-BR')}
        </Text>
        {detail ? <Text style={styles.stripDetail}>· {detail}</Text> : null}
      </View>
    </View>
  );
}

function HealthRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'caution';
}) {
  return (
    <View style={styles.healthRow}>
      <Text style={styles.healthLabel}>{label}</Text>
      <Text style={[styles.healthValue, tone === 'caution' && styles.healthCaution]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    width: '100%',
    maxWidth: 1360,
    alignSelf: 'center',
    gap: 18,
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
    gap: 10,
  },
  kicker: {
    color: cloudTheme.colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  title: { color: cloudTheme.colors.text, fontSize: 27, fontWeight: '800' },
  lead: { color: cloudTheme.colors.textSecondary, fontSize: 14, lineHeight: 20, maxWidth: 560 },
  updatedLabel: { color: cloudTheme.colors.textMuted, fontSize: 12, fontWeight: '600', marginRight: 4 },
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
    minHeight: 68,
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
    paddingVertical: 10,
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
  stripValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    flexWrap: 'wrap',
  },
  stripValue: {
    color: cloudTheme.colors.text,
    fontSize: 21,
    fontWeight: '800',
    ...tabularNums,
  },
  stripDetail: { color: cloudTheme.colors.textMuted, fontSize: 12, fontWeight: '600' },
  stripStatus: { color: cloudTheme.colors.text, fontSize: 15, fontWeight: '700' },
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
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '0%',
    minWidth: 0,
    gap: 22,
  },
  sideCol: {
    width: 320,
    maxWidth: '100%',
    flexShrink: 0,
    gap: 22,
  },
  sideColSticky: Platform.select({
    web: {
      position: 'sticky' as ViewStyle['position'],
      top: 80,
      alignSelf: 'flex-start',
    },
    default: {},
  }) as ViewStyle,
  panel: {
    gap: 10,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: cloudTheme.colors.border,
  },
  panelHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 4,
  },
  panelTitleBlock: { flex: 1, minWidth: 0, gap: 2 },
  sectionTitle: {
    color: cloudTheme.colors.text,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },
  panelMeta: { color: cloudTheme.colors.textMuted, fontSize: 12, fontWeight: '700' },
  panelSubmeta: { color: cloudTheme.colors.textSecondary, fontSize: 12, fontWeight: '600' },
  table: {
    borderTopWidth: 1,
    borderTopColor: cloudTheme.colors.border,
    width: '100%',
  },
  tableHead: {
    minHeight: 36,
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
    minHeight: 56,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: cloudTheme.colors.border,
    backgroundColor: 'transparent',
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
  cell: { color: cloudTheme.colors.textSecondary, fontSize: 13, lineHeight: 18 },
  cellStrong: { color: cloudTheme.colors.text, fontSize: 13, fontWeight: '600' },
  whenCell: {
    color: cloudTheme.colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    ...tabularNums,
  },
  priTag: {
    fontSize: 12,
    fontWeight: '700',
  },
  pri_critical: { color: cloudTheme.colors.danger },
  pri_high: { color: '#9A6B1F' },
  pri_normal: { color: cloudTheme.colors.text },
  pri_low: { color: cloudTheme.colors.textMuted },
  arrow: { color: cloudTheme.colors.textMuted, fontSize: 14, fontWeight: '700', textAlign: 'right' },
  distList: { gap: 10 },
  distRow: { gap: 4 },
  distMeta: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
  },
  distLabel: { color: cloudTheme.colors.text, fontSize: 13, fontWeight: '500', flex: 1 },
  distValue: {
    color: cloudTheme.colors.text,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'right',
    minWidth: 24,
    ...tabularNums,
  },
  distZero: { color: cloudTheme.colors.textMuted, fontWeight: '400' },
  distTrack: {
    height: 5,
    borderRadius: 1,
    backgroundColor: '#EEF1EE',
    overflow: 'hidden',
  },
  distTrackEmpty: { height: 5 },
  distBar: {
    height: '100%',
    borderRadius: 1,
    backgroundColor: '#5A7263',
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
  healthLabel: { color: cloudTheme.colors.textMuted, fontSize: 12, fontWeight: '600' },
  healthValue: {
    color: cloudTheme.colors.text,
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'right',
  },
  healthCaution: { color: '#9A6B1F', fontWeight: '600' },
  primaryButton: {
    minHeight: 44,
    minWidth: 118,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    borderRadius: 4,
    backgroundColor: '#1F6B45',
  },
  primaryButtonText: { color: '#FFFFFF', fontWeight: '800', fontSize: 13 },
  secondaryButton: {
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#1F6B45',
    borderRadius: 4,
    backgroundColor: cloudTheme.colors.surface,
  },
  secondaryButtonText: { color: '#1F6B45', fontWeight: '800', fontSize: 13 },
  textAction: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  textActionLabel: { color: '#1F6B45', fontSize: 13, fontWeight: '700' },
  pressed: { opacity: 0.88 },
  disabled: { opacity: 0.5 },
});
