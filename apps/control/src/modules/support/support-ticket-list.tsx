import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { ContextualSearch } from '@/components/cloud/contextual-search';
import { StatusBadge } from '@/components/cloud/status-badge';
import { useControlAuth } from '@/contexts/control-auth-context';
import { resolveCloudActionAvailability } from '@/features/cloud/cloud-action-availability';
import { SupportFilterMenu } from '@/modules/support/support-filter-menu';
import {
  assigneeLabel,
  categoryLabels,
  categoryOptions,
  clientLabel,
  formatDateTime,
  formatRelative,
  isSlaAtRisk,
  priorityLabels,
  priorityOptions,
  slaLabel,
  slaOptions,
  sortTickets,
  statusLabels,
  statusOptions,
  syncLabel,
  type SupportSortKey,
} from '@/modules/support/support-labels';
import {
  parseSupportQueueParams,
  SUPPORT_PAGE_SIZES,
  supportQueueSetParams,
  supportTicketHref,
  type SupportQueueParams,
} from '@/modules/support/support-queue-params';
import { CLOUD_ROUTES } from '@/navigation/cloud-routes';
import { subscribeToControlLive } from '@/services/control-live';
import {
  configureSupportTeamMember,
  ControlSupportError,
  getControlSupportOverview,
  setControlSupportRuntime,
  type SupportCapabilities,
  type SupportCategory,
  type SupportOverview,
  type SupportPriority,
  type SupportStatus,
} from '@/services/control-support';
import { cloudTheme } from '@/theme/cloud-components';

const tableGrid = Platform.select<ViewStyle>({
  web: {
    display: 'grid' as ViewStyle['display'],
    // @ts-expect-error RN web CSS grid template
    gridTemplateColumns: '36px minmax(120px, 1fr) minmax(140px, 1.2fr) minmax(180px, 1.6fr) 90px 110px 110px 130px 110px 90px',
    alignItems: 'center',
    columnGap: 10,
    width: '100%',
  },
  default: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    width: '100%',
  },
}) as ViewStyle;

const priorityTone: Record<SupportPriority, TextStyle> = {
  critical: { color: '#fff', backgroundColor: '#9a3f37' },
  high: { color: '#7d4d11', backgroundColor: '#f9e3bd' },
  normal: { color: '#285f43', backgroundColor: '#dcefe3' },
  low: { color: '#526158', backgroundColor: '#e9ece9' },
};

function errorMessage(error: unknown): string {
  if (!(error instanceof ControlSupportError)) return 'Não foi possível concluir esta operação.';
  switch (error.code) {
    case 'aal2_required':
      return 'A sessão precisa ser confirmada novamente com o autenticador.';
    case 'forbidden':
      return 'Seu acesso atual não permite consultar ou alterar esta fila.';
    case 'invalid_response':
      return 'O servidor retornou dados de suporte em formato inesperado.';
    case 'not_found':
      return 'O chamado não foi encontrado ou não está disponível para esta equipe.';
    case 'reason_required':
      return 'Informe uma justificativa válida para esta operação.';
    default:
      return 'O suporte está temporariamente indisponível. Tente novamente.';
  }
}

function RuntimeInline({
  capabilities,
  onNotice,
  onSaved,
}: {
  capabilities: SupportCapabilities;
  onNotice: (message: string) => void;
  onSaved: () => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [enabled, setEnabled] = useState(capabilities.enabled);
  const [allowNewTickets, setAllowNewTickets] = useState(capabilities.allowNewTickets);
  const [syncEnabled, setSyncEnabled] = useState(capabilities.syncEnabled);
  const [maintenanceMessage, setMaintenanceMessage] = useState(capabilities.maintenanceMessage ?? '');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setEnabled(capabilities.enabled);
    setAllowNewTickets(capabilities.allowNewTickets);
    setSyncEnabled(capabilities.syncEnabled);
    setMaintenanceMessage(capabilities.maintenanceMessage ?? '');
  }, [capabilities]);

  const save = async () => {
    if (reason.trim().length < 10) {
      onNotice('Informe uma justificativa com pelo menos 10 caracteres.');
      return;
    }
    setBusy(true);
    try {
      await setControlSupportRuntime({
        enabled,
        allowNewTickets,
        syncEnabled,
        maintenanceMessage,
        reason,
      });
      setReason('');
      onNotice('Configuração operacional do suporte atualizada.');
      await onSaved();
    } catch (error) {
      onNotice(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.runtime}>
      <Pressable
        accessibilityRole="button"
        onPress={() => setExpanded((current) => !current)}
        style={styles.runtimeTrigger}
      >
        <Text style={styles.runtimeSummary} numberOfLines={1}>
          JSM {enabled ? 'ativo' : 'pausado'} · sync {syncEnabled ? 'on' : 'off'}
        </Text>
        <Text style={styles.linkText}>{expanded ? 'Ocultar' : 'Configurar'}</Text>
      </Pressable>
      {expanded ? (
        <View style={styles.runtimePanel}>
          <View style={styles.runtimeToggles}>
            {[
              ['Módulo', enabled, setEnabled] as const,
              ['Novos', allowNewTickets, setAllowNewTickets] as const,
              ['Sync', syncEnabled, setSyncEnabled] as const,
            ].map(([label, value, setter]) => (
              <Pressable
                key={label}
                accessibilityRole="switch"
                accessibilityState={{ checked: value, disabled: busy }}
                disabled={busy}
                onPress={() => setter(!value)}
                style={[styles.toggle, value && styles.toggleOn, busy && styles.disabled]}
              >
                <Text style={[styles.toggleText, value && styles.toggleTextOn]}>
                  {label}: {value ? 'ativo' : 'pausado'}
                </Text>
              </Pressable>
            ))}
          </View>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => { void save(); }}
            style={[styles.secondaryButton, busy && styles.disabled]}
          >
            <Text style={styles.secondaryButtonText}>{busy ? 'Salvando…' : 'Salvar runtime'}</Text>
          </Pressable>
          {reason.trim().length < 10 ? (
            <Text style={styles.muted}>Justificativa (≥10 caracteres) necessária para salvar.</Text>
          ) : null}
          <TextInput
            accessibilityLabel="Justificativa da alteração de runtime"
            editable={!busy}
            onChangeText={setReason}
            placeholder="Justificativa da alteração de runtime"
            placeholderTextColor={cloudTheme.colors.textMuted}
            style={styles.inlineInput}
            value={reason}
          />
          <TextInput
            accessibilityLabel="Mensagem de manutenção"
            editable={!busy}
            onChangeText={setMaintenanceMessage}
            placeholder="Mensagem de manutenção (opcional)"
            placeholderTextColor={cloudTheme.colors.textMuted}
            style={styles.inlineInput}
            value={maintenanceMessage}
          />
        </View>
      ) : null}
    </View>
  );
}

export function SupportTicketList() {
  const router = useRouter();
  const rawParams = useLocalSearchParams();
  const queue = useMemo(() => parseSupportQueueParams(rawParams), [rawParams]);
  const { width } = useWindowDimensions();
  const compact = width < 900;
  const { can, context } = useControlAuth();
  const canRead = can('control.support.read');
  const canManage = can('control.support.manage');

  const [overview, setOverview] = useState<SupportOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [jiraAccountId, setJiraAccountId] = useState('');
  const [membershipReason, setMembershipReason] = useState('');
  const [membershipBusy, setMembershipBusy] = useState(false);
  const [loadedAt, setLoadedAt] = useState<number | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const requestId = useRef(0);
  const liveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setQueue = useCallback((patch: Partial<SupportQueueParams>) => {
    const next = { ...queue, ...patch };
    if (
      patch.status !== undefined
      || patch.priority !== undefined
      || patch.category !== undefined
      || patch.sla !== undefined
      || patch.q !== undefined
      || patch.pageSize !== undefined
    ) {
      next.page = patch.page ?? 1;
    }
    router.setParams(supportQueueSetParams(next) as never);
  }, [queue, router]);

  const loadOverview = useCallback(async (before: string | null = null) => {
    const id = ++requestId.current;
    if (before) setLoadingMore(true);
    else {
      setLoading(true);
      setError('');
    }
    try {
      const result = await getControlSupportOverview({
        status: queue.status,
        priority: queue.priority,
        category: queue.category,
        limit: 50,
        before,
      });
      if (id !== requestId.current) return;
      setOverview((current) => {
        if (!before || !current) return result;
        const tickets = new Map(current.tickets.map((ticket) => [ticket.id, ticket]));
        result.tickets.forEach((ticket) => tickets.set(ticket.id, ticket));
        return { ...result, tickets: [...tickets.values()] };
      });
      setLoadedAt(Date.now());
    } catch (loadError) {
      if (id === requestId.current) setError(errorMessage(loadError));
    } finally {
      if (id === requestId.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [queue.category, queue.priority, queue.status]);

  useFocusEffect(useCallback(() => {
    if (canRead) void loadOverview();
    const tick = setInterval(() => setNowTick(Date.now()), 30_000);
    return () => {
      requestId.current += 1;
      clearInterval(tick);
    };
  }, [canRead, loadOverview]));

  useEffect(() => {
    if (!canRead) return undefined;
    let active = true;
    let unsubscribe: (() => void) | null = null;
    void subscribeToControlLive({
      onInvalidate: (scope) => {
        if (!active || (scope && scope !== 'support')) return;
        if (liveTimer.current) clearTimeout(liveTimer.current);
        liveTimer.current = setTimeout(() => {
          liveTimer.current = null;
          void loadOverview();
        }, 350);
      },
    }).then((cleanup) => {
      if (!active) cleanup();
      else unsubscribe = cleanup;
    }).catch(() => undefined);
    return () => {
      active = false;
      unsubscribe?.();
      if (liveTimer.current) clearTimeout(liveTimer.current);
    };
  }, [canRead, loadOverview]);

  const createTicketAction = resolveCloudActionAvailability({
    action: 'create_support_ticket',
    can,
    allowNewTickets: overview?.capabilities?.allowNewTickets ?? false,
  });

  const activeMember = Boolean(overview?.operator.active && overview.operator.memberRole);
  const showOwnerSetup = Boolean(
    overview && !activeMember && canManage && context?.role === 'SaaS_Owner',
  );

  const filtered = useMemo(() => {
    const tickets = overview?.tickets ?? [];
    const needle = queue.q.trim().toLowerCase();
    const matched = tickets.filter((ticket) => {
      if (needle) {
        const haystack = [
          ticket.protocol,
          ticket.subject,
          ticket.requesterDisplayName,
          ticket.locationLabel,
          categoryLabels[ticket.category],
        ].filter(Boolean).join(' ').toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      if (queue.sla === 'at_risk' && !isSlaAtRisk(ticket)) return false;
      if (queue.sla === 'ok' && isSlaAtRisk(ticket)) return false;
      return true;
    });
    return sortTickets(matched, queue.sort);
  }, [overview?.tickets, queue.q, queue.sla, queue.sort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / queue.pageSize));
  const page = Math.min(queue.page, pageCount);
  const pageRows = filtered.slice((page - 1) * queue.pageSize, page * queue.pageSize);

  const activeChips = useMemo(() => {
    const chips: { key: string; label: string; clear: () => void }[] = [];
    if (queue.q) chips.push({ key: 'q', label: `Busca: ${queue.q}`, clear: () => setQueue({ q: '' }) });
    if (queue.status) {
      chips.push({
        key: 'status',
        label: statusLabels[queue.status],
        clear: () => setQueue({ status: null }),
      });
    }
    if (queue.priority) {
      chips.push({
        key: 'priority',
        label: priorityLabels[queue.priority],
        clear: () => setQueue({ priority: null }),
      });
    }
    if (queue.category) {
      chips.push({
        key: 'category',
        label: categoryLabels[queue.category],
        clear: () => setQueue({ category: null }),
      });
    }
    if (queue.sla !== 'all') {
      chips.push({
        key: 'sla',
        label: queue.sla === 'at_risk' ? 'Fora do SLA' : 'No prazo',
        clear: () => setQueue({ sla: 'all' }),
      });
    }
    return chips;
  }, [queue, setQueue]);

  const clearFilters = () => {
    router.setParams(supportQueueSetParams({
      q: '',
      status: null,
      priority: null,
      category: null,
      sla: 'all',
      sort: 'updated',
      page: 1,
      pageSize: queue.pageSize,
    }) as never);
  };

  const openTicket = (ticketId: string) => {
    router.push(supportTicketHref(ticketId, { ...queue, page }) as never);
  };

  const toggleSelected = (ticketId: string) => {
    setSelectedIds((current) => (
      current.includes(ticketId)
        ? current.filter((id) => id !== ticketId)
        : [...current, ticketId]
    ));
  };

  const configureOwnMembership = async () => {
    if (
      !canManage
      || context?.role !== 'SaaS_Owner'
      || jiraAccountId.trim().length < 5
      || membershipReason.trim().length < 10
    ) {
      setNotice('Informe o Jira account ID e uma justificativa com pelo menos 10 caracteres.');
      return;
    }
    setMembershipBusy(true);
    try {
      await configureSupportTeamMember({
        profileId: context.profileId,
        jiraAccountId,
        role: 'lead',
        active: true,
        reason: membershipReason,
      });
      setJiraAccountId('');
      setMembershipReason('');
      setNotice('Seu acesso foi vinculado à equipe SUPORTE_GERAL.');
      await loadOverview();
    } catch (membershipError) {
      setNotice(errorMessage(membershipError));
    } finally {
      setMembershipBusy(false);
    }
  };

  return (
    <View style={styles.page}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.kicker}>SUPORTE / ATENDIMENTOS</Text>
          <Text style={styles.title}>Atendimentos</Text>
          <Text style={styles.lead}>
            Fila operacional com foco em priorização e acompanhamento.
          </Text>
        </View>
        <View style={styles.headerActions}>
          <Text style={styles.updated}>
            {loadedAt ? `Atualizado ${formatRelative(new Date(loadedAt).toISOString(), nowTick)}` : 'Aguardando dados'}
          </Text>
          <Pressable
            accessibilityRole="button"
            disabled={loading}
            onPress={() => { void loadOverview(); }}
            style={[styles.secondaryButton, loading && styles.disabled]}
          >
            <Text style={styles.secondaryButtonText}>Atualizar</Text>
          </Pressable>
          {createTicketAction.visible ? (
            <View style={styles.createWrap}>
              <Pressable
                accessibilityRole="button"
                disabled={!createTicketAction.enabled}
                onPress={() => {
                  setNotice(createTicketAction.enabled
                    ? 'Fluxo de criação aguarda homologação da integração CutSync → Jira.'
                    : (createTicketAction.reason ?? 'Criação bloqueada.'));
                }}
                style={[styles.primaryButton, !createTicketAction.enabled && styles.disabled]}
              >
                <Text style={styles.primaryButtonText}>
                  {createTicketAction.enabled ? '+ Novo atendimento' : '+ Novo atendimento'}
                </Text>
              </Pressable>
              {!createTicketAction.enabled && createTicketAction.reason ? (
                <Text style={styles.createHint}>{createTicketAction.reason}</Text>
              ) : null}
            </View>
          ) : null}
        </View>
      </View>

      {notice ? <Text accessibilityRole="alert" style={styles.notice}>{notice}</Text> : null}

      {loading && !overview ? (
        <View style={styles.loading}>
          <ActivityIndicator color={cloudTheme.colors.brand} />
          <Text style={styles.muted}>Carregando a fila…</Text>
        </View>
      ) : null}

      {error ? (
        <View style={styles.errorRow}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable accessibilityRole="button" onPress={() => { void loadOverview(); }} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Tentar novamente</Text>
          </Pressable>
        </View>
      ) : null}

      {showOwnerSetup ? (
        <View style={styles.setup}>
          <Text style={styles.sectionTitle}>Primeiro operador</Text>
          <Text style={styles.muted}>
            Vincule sua conta de agente do Jira à equipe SUPORTE_GERAL. A conta técnica da integração permanece separada.
          </Text>
          <TextInput
            accessibilityLabel="Jira account ID"
            onChangeText={setJiraAccountId}
            placeholder="Jira account ID"
            placeholderTextColor={cloudTheme.colors.textMuted}
            style={styles.inlineInput}
            value={jiraAccountId}
          />
          <TextInput
            accessibilityLabel="Justificativa"
            onChangeText={setMembershipReason}
            placeholder="Justificativa"
            placeholderTextColor={cloudTheme.colors.textMuted}
            style={styles.inlineInput}
            value={membershipReason}
          />
          <Pressable
            accessibilityRole="button"
            disabled={membershipBusy}
            onPress={() => { void configureOwnMembership(); }}
            style={[styles.primaryButton, membershipBusy && styles.disabled]}
          >
            <Text style={styles.primaryButtonText}>
              {membershipBusy ? 'Vinculando…' : 'Vincular à equipe geral'}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {overview && !activeMember && !showOwnerSetup ? (
        <Text style={styles.muted}>
          Seu acesso ao Cloud está ativo, mas a projeção dos chamados exige participação em uma equipe de suporte.
        </Text>
      ) : null}

      {overview && activeMember ? (
        <>
          <View style={styles.contextStrip}>
            <Text style={styles.contextText} numberOfLines={1}>
              {overview.operator.name}
              {overview.operator.memberRole
                ? ` · ${overview.operator.memberRole === 'lead' ? 'Liderança' : 'Agente'}`
                : ''}
              {' · '}
              {overview.counts.total} na fila filtrada
            </Text>
            {overview.capabilities && canManage && context?.role === 'SaaS_Owner' ? (
              <RuntimeInline
                capabilities={overview.capabilities}
                onNotice={setNotice}
                onSaved={() => loadOverview()}
              />
            ) : overview.capabilities ? (
              <Text style={styles.runtimeSummary}>
                JSM {overview.capabilities.enabled ? 'ativo' : 'pausado'}
              </Text>
            ) : null}
          </View>

          <View style={styles.toolbar}>
            <View style={styles.searchWrap}>
              <ContextualSearch
                value={queue.q}
                onChangeText={(value) => setQueue({ q: value })}
                placeholder="Buscar chamados, clientes ou protocolos"
              />
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
              <SupportFilterMenu
                label="Status"
                value={queue.status}
                options={statusOptions}
                onChange={(value) => setQueue({ status: value as SupportStatus | null })}
              />
              <SupportFilterMenu
                label="SLA"
                value={queue.sla === 'all' ? null : queue.sla}
                options={slaOptions}
                onChange={(value) => setQueue({ sla: value ?? 'all' })}
              />
              <SupportFilterMenu
                label="Prioridade"
                value={queue.priority}
                options={priorityOptions}
                onChange={(value) => setQueue({ priority: value as SupportPriority | null })}
              />
              <SupportFilterMenu
                label="Área"
                value={queue.category}
                options={categoryOptions}
                onChange={(value) => setQueue({ category: value as SupportCategory | null })}
              />
              <SupportFilterMenu
                label="Ordenação"
                value={queue.sort === 'updated' ? null : queue.sort}
                options={[
                  { value: 'sla' as SupportSortKey, label: 'SLA' },
                  { value: 'priority' as SupportSortKey, label: 'Prioridade' },
                  { value: 'status' as SupportSortKey, label: 'Status' },
                ]}
                onChange={(value) => setQueue({ sort: value ?? 'updated' })}
              />
            </ScrollView>
          </View>

          {activeChips.length ? (
            <View style={styles.chips}>
              {activeChips.map((chip) => (
                <Pressable key={chip.key} accessibilityRole="button" onPress={chip.clear} style={styles.chip}>
                  <Text style={styles.chipText}>{chip.label} ×</Text>
                </Pressable>
              ))}
              <Pressable accessibilityRole="button" onPress={clearFilters} style={styles.clear}>
                <Text style={styles.linkText}>Limpar</Text>
              </Pressable>
            </View>
          ) : null}

          {canManage && selectedIds.length > 0 ? (
            <View style={styles.batch}>
              <Text style={styles.muted}>{selectedIds.length} selecionado(s)</Text>
              <StatusBadge label="LOTE BLOQUEADO" tone="warning" />
              <Text style={styles.muted}>
                Ações em lote aguardam RPC homologada. Use o detalhe do chamado para mutações autorizadas.
              </Text>
            </View>
          ) : null}

          <View style={styles.resultsMeta}>
            <Text style={styles.resultsCount}>
              {filtered.length} resultado{filtered.length === 1 ? '' : 's'}
            </Text>
            <Pressable accessibilityRole="link" onPress={() => router.push(CLOUD_ROUTES.suporte.root)}>
              <Text style={styles.linkText}>Visão geral</Text>
            </Pressable>
          </View>

          {!compact ? (
            <View style={styles.table}>
              <View style={[styles.tableHead, tableGrid]}>
                <Text style={styles.headCell} />
                <Text style={styles.headCell}>Protocolo</Text>
                <Text style={styles.headCell}>Cliente</Text>
                <Text style={styles.headCell}>Motivo</Text>
                <Text style={styles.headCell}>Prioridade</Text>
                <Text style={styles.headCell}>SLA</Text>
                <Text style={styles.headCell}>Responsável</Text>
                <Text style={styles.headCell}>Última interação</Text>
                <Text style={styles.headCell}>Status</Text>
                <Text style={styles.headCell}>Sync</Text>
              </View>
              {pageRows.map((ticket) => {
                const slaRisk = isSlaAtRisk(ticket);
                return (
                  <Pressable
                    key={ticket.id}
                    accessibilityRole="link"
                    accessibilityLabel={`Abrir chamado ${ticket.protocol}`}
                    onPress={() => openTicket(ticket.id)}
                    style={({ pressed }) => [
                      styles.tableRow,
                      tableGrid,
                      slaRisk && styles.rowSla,
                      pressed && styles.rowHover,
                    ]}
                  >
                    {canManage ? (
                      <Pressable
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: selectedIds.includes(ticket.id) }}
                        hitSlop={8}
                        onPress={(event) => {
                          event.stopPropagation?.();
                          toggleSelected(ticket.id);
                        }}
                        style={[styles.checkbox, selectedIds.includes(ticket.id) && styles.checkboxOn]}
                      >
                        <Text style={styles.checkboxMark}>
                          {selectedIds.includes(ticket.id) ? '✓' : ''}
                        </Text>
                      </Pressable>
                    ) : <View />}
                    <Text style={styles.protocol} numberOfLines={1}>{ticket.protocol}</Text>
                    <Text style={styles.client} numberOfLines={1}>{clientLabel(ticket)}</Text>
                    <Text style={styles.cell} numberOfLines={2}>{ticket.subject}</Text>
                    <Text style={[styles.tag, priorityTone[ticket.priority]]} numberOfLines={1}>
                      {priorityLabels[ticket.priority]}
                    </Text>
                    <Text style={[styles.tagNeutral, slaRisk && styles.slaRisk]} numberOfLines={1}>
                      {slaLabel(ticket)}
                    </Text>
                    <Text style={styles.mono} numberOfLines={1}>{assigneeLabel(ticket)}</Text>
                    <Text style={styles.cellMuted} numberOfLines={1}>
                      {formatDateTime(ticket.lastMessageAt ?? ticket.updatedAt)}
                    </Text>
                    <Text style={styles.tagNeutral} numberOfLines={1}>{statusLabels[ticket.status]}</Text>
                    <Text
                      style={[styles.tagNeutral, ticket.syncStatus === 'failed' && styles.slaRisk]}
                      numberOfLines={1}
                    >
                      {syncLabel(ticket.syncStatus)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <View style={styles.cards}>
              {pageRows.map((ticket) => {
                const slaRisk = isSlaAtRisk(ticket);
                return (
                  <Pressable
                    key={ticket.id}
                    accessibilityRole="link"
                    onPress={() => openTicket(ticket.id)}
                    style={[styles.card, slaRisk && styles.rowSla]}
                  >
                    <View style={styles.cardTop}>
                      <Text style={styles.protocol}>{ticket.protocol}</Text>
                      <Text style={[styles.tag, priorityTone[ticket.priority]]}>
                        {priorityLabels[ticket.priority]}
                      </Text>
                    </View>
                    <Text style={styles.client}>{clientLabel(ticket)}</Text>
                    <Text style={styles.cell} numberOfLines={2}>{ticket.subject}</Text>
                    <View style={styles.cardMeta}>
                      <Text style={[styles.tagNeutral, slaRisk && styles.slaRisk]}>{slaLabel(ticket)}</Text>
                      <Text style={styles.tagNeutral}>{statusLabels[ticket.status]}</Text>
                      <Text style={styles.cellMuted}>
                        {formatRelative(ticket.lastMessageAt ?? ticket.updatedAt, nowTick)}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}

          {!loading && pageRows.length === 0 ? (
            <Text style={styles.empty}>Nenhum chamado corresponde aos filtros atuais.</Text>
          ) : null}

          <View style={styles.pagination}>
            <View style={styles.pageSizeRow}>
              <Text style={styles.muted}>Linhas por página</Text>
              {SUPPORT_PAGE_SIZES.map((size) => (
                <Pressable
                  key={size}
                  accessibilityRole="button"
                  onPress={() => setQueue({ pageSize: size, page: 1 })}
                  style={[styles.pageSizeChip, queue.pageSize === size && styles.pageSizeChipOn]}
                >
                  <Text style={styles.pageSizeText}>{size}</Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.pageNav}>
              <Pressable
                accessibilityRole="button"
                disabled={page <= 1}
                onPress={() => setQueue({ page: page - 1 })}
                style={[styles.secondaryButton, page <= 1 && styles.disabled]}
              >
                <Text style={styles.secondaryButtonText}>Anterior</Text>
              </Pressable>
              <Text style={styles.muted}>{page} / {pageCount}</Text>
              <Pressable
                accessibilityRole="button"
                disabled={page >= pageCount}
                onPress={() => setQueue({ page: page + 1 })}
                style={[styles.secondaryButton, page >= pageCount && styles.disabled]}
              >
                <Text style={styles.secondaryButtonText}>Próxima</Text>
              </Pressable>
            </View>
          </View>

          {overview.nextCursor ? (
            <Pressable
              accessibilityRole="button"
              disabled={loadingMore}
              onPress={() => { void loadOverview(overview.nextCursor); }}
              style={[styles.secondaryButton, loadingMore && styles.disabled, styles.loadMore]}
            >
              <Text style={styles.secondaryButtonText}>
                {loadingMore ? 'Carregando…' : 'Carregar mais da fonte'}
              </Text>
            </Pressable>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    width: '100%',
    maxWidth: 1440,
    alignSelf: 'center',
    gap: 14,
    paddingHorizontal: 32,
    paddingVertical: cloudTheme.layout.contentPadding,
  },
  header: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 14,
    alignItems: 'flex-end',
  },
  headerText: { flex: 1, minWidth: 260, gap: 4 },
  headerActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  kicker: { color: cloudTheme.colors.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  title: { color: cloudTheme.colors.text, fontSize: 27, fontWeight: '800' },
  lead: { color: cloudTheme.colors.textSecondary, fontSize: 14, lineHeight: 20, maxWidth: 560 },
  updated: { color: cloudTheme.colors.textMuted, fontSize: 12, fontWeight: '600' },
  createWrap: { alignItems: 'flex-end', gap: 4, maxWidth: 280 },
  createHint: { color: cloudTheme.colors.textMuted, fontSize: 11, textAlign: 'right' },
  loading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  muted: { color: cloudTheme.colors.textSecondary, fontSize: 12, lineHeight: 18 },
  notice: {
    padding: 12,
    borderWidth: 1,
    borderColor: '#b8d8c5',
    borderRadius: 4,
    backgroundColor: '#f0faf4',
    color: '#285f43',
    fontWeight: '600',
  },
  errorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    alignItems: 'center',
    padding: 14,
    borderWidth: 1,
    borderColor: cloudTheme.colors.danger,
    borderRadius: 4,
    backgroundColor: cloudTheme.colors.dangerSoft,
  },
  errorText: { flex: 1, minWidth: 200, color: cloudTheme.colors.danger },
  setup: {
    gap: 10,
    padding: 16,
    borderWidth: 1,
    borderColor: cloudTheme.colors.border,
    borderRadius: 4,
    backgroundColor: cloudTheme.colors.surface,
  },
  sectionTitle: { color: cloudTheme.colors.text, fontSize: 15, fontWeight: '800' },
  contextStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: cloudTheme.colors.border,
  },
  contextText: { color: cloudTheme.colors.text, fontSize: 13, fontWeight: '600', flex: 1 },
  runtime: { gap: 8, minWidth: 200 },
  runtimeTrigger: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 36 },
  runtimeSummary: { color: cloudTheme.colors.textSecondary, fontSize: 11, fontWeight: '700', flex: 1 },
  runtimePanel: { gap: 8 },
  runtimeToggles: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  toggle: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: cloudTheme.colors.border,
    borderRadius: 4,
    backgroundColor: '#f5f7f4',
  },
  toggleOn: { borderColor: '#347452', backgroundColor: '#e3f2e8' },
  toggleText: { color: cloudTheme.colors.textMuted, fontSize: 11, fontWeight: '800' },
  toggleTextOn: { color: '#285f43' },
  toolbar: { gap: 10 },
  searchWrap: { width: '100%' },
  filters: { flexDirection: 'row', gap: 8, paddingRight: 8, zIndex: 20 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  chip: {
    minHeight: 32,
    justifyContent: 'center',
    paddingHorizontal: 10,
    borderRadius: 4,
    backgroundColor: '#eef2ef',
  },
  chipText: { color: '#274936', fontSize: 11, fontWeight: '700' },
  clear: { minHeight: 32, justifyContent: 'center', paddingHorizontal: 6 },
  batch: {
    gap: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e6d4a8',
    borderRadius: 4,
    backgroundColor: '#fffbf1',
  },
  resultsMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  resultsCount: { color: cloudTheme.colors.text, fontSize: 13, fontWeight: '700' },
  table: {
    width: '100%',
    borderTopWidth: 1,
    borderTopColor: cloudTheme.colors.border,
    backgroundColor: cloudTheme.colors.surface,
  },
  tableHead: {
    minHeight: 40,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: cloudTheme.colors.border,
    backgroundColor: '#f5f7f4',
  },
  tableRow: {
    minHeight: 56,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: cloudTheme.colors.border,
  },
  rowSla: { borderLeftWidth: 3, borderLeftColor: '#c9892f', paddingLeft: 8, marginLeft: -8 },
  rowHover: { backgroundColor: '#f5f8f5' },
  headCell: { color: cloudTheme.colors.textMuted, fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  protocol: { color: cloudTheme.colors.textMuted, fontSize: 12, fontFamily: 'monospace', fontWeight: '600' },
  client: { color: cloudTheme.colors.text, fontSize: 13, fontWeight: '800' },
  cell: { color: cloudTheme.colors.textSecondary, fontSize: 13, lineHeight: 18 },
  cellMuted: { color: cloudTheme.colors.textMuted, fontSize: 12 },
  mono: { color: cloudTheme.colors.textSecondary, fontSize: 12, fontFamily: 'monospace' },
  tag: {
    overflow: 'hidden',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 4,
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'center',
  },
  tagNeutral: {
    overflow: 'hidden',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 4,
    fontSize: 11,
    fontWeight: '700',
    color: '#526158',
    backgroundColor: '#eef1ee',
    textAlign: 'center',
  },
  slaRisk: { color: '#8b641d', backgroundColor: '#f8edd8', fontWeight: '800' },
  inlineInput: {
    minHeight: 44,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: cloudTheme.colors.border,
    borderRadius: 4,
    backgroundColor: cloudTheme.colors.surface,
    color: cloudTheme.colors.text,
    fontSize: 13,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderWidth: 1,
    borderColor: '#bdc9bf',
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  checkboxOn: { borderColor: '#27523b', backgroundColor: '#27523b' },
  checkboxMark: { color: '#fff', fontSize: 12, fontWeight: '800' },
  cards: { gap: 8 },
  card: {
    gap: 6,
    padding: 12,
    borderWidth: 1,
    borderColor: cloudTheme.colors.border,
    borderRadius: 4,
    backgroundColor: cloudTheme.colors.surface,
    minHeight: 44,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  cardMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  empty: { paddingVertical: 20, textAlign: 'center', color: cloudTheme.colors.textMuted },
  pagination: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  pageSizeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  pageSizeChip: {
    minHeight: 36,
    minWidth: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: cloudTheme.colors.border,
    borderRadius: 4,
    paddingHorizontal: 8,
  },
  pageSizeChipOn: { borderColor: '#1F6B45', backgroundColor: '#E8F3EC' },
  pageSizeText: { fontSize: 12, fontWeight: '700', color: cloudTheme.colors.text },
  pageNav: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  loadMore: { alignSelf: 'flex-start' },
  primaryButton: {
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 14,
    borderRadius: 4,
    backgroundColor: '#1F6B45',
  },
  primaryButtonText: { color: '#fff', fontWeight: '800', fontSize: 13 },
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
  secondaryButtonText: { color: '#1F6B45', fontWeight: '800', fontSize: 12 },
  linkText: { color: '#1F6B45', fontSize: 12, fontWeight: '800' },
  disabled: { opacity: 0.45 },
});
