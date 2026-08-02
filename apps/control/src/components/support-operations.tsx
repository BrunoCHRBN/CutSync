import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

import { ContextualSearch } from '@/components/cloud/contextual-search';
import { StatusBadge } from '@/components/cloud/status-badge';
import { useControlAuth } from '@/contexts/control-auth-context';
import { resolveCloudActionAvailability } from '@/features/cloud/cloud-action-availability';
import { CLOUD_ROUTES } from '@/navigation/cloud-routes';
import { subscribeToControlLive } from '@/services/control-live';
import {
  configureSupportTeamMember,
  ControlSupportError,
  escalateSupportTicket,
  getControlSupportOverview,
  getControlSupportTicket,
  isSupportTicketId,
  reprocessSupportSync,
  setControlSupportRuntime,
  supportCategories,
  supportPriorities,
  supportStatuses,
  type SupportCategory,
  type SupportCapabilities,
  type SupportEscalationLevel,
  type SupportOverview,
  type SupportPriority,
  type SupportStatus,
  type SupportTicketDetail,
  type SupportTicketSummary,
} from '@/services/control-support';

const statusLabels: Record<SupportStatus, string> = {
  queued: 'Na fila',
  open: 'Aberto',
  in_progress: 'Em andamento',
  waiting_user: 'Aguardando usuário',
  resolved: 'Resolvido',
  closed: 'Fechado',
  sync_failed: 'Falha de sincronização',
};

const priorityLabels: Record<SupportPriority, string> = {
  critical: 'Crítica',
  high: 'Alta',
  normal: 'Normal',
  low: 'Baixa',
};

const categoryLabels: Record<SupportCategory, string> = {
  access_identity: 'Acesso e identidade',
  booking: 'Agendamento',
  business_operations: 'Operação',
  billing: 'Cobrança',
  marketplace: 'Marketplace',
  security_privacy: 'Segurança',
  platform_incident: 'Incidente',
  product_feedback: 'Produto',
  other: 'Outros',
};

const statusOptions = supportStatuses.map((value) => ({ value, label: statusLabels[value] }));
const priorityOptions = supportPriorities.map((value) => ({ value, label: priorityLabels[value] }));
const categoryOptions = supportCategories.map((value) => ({ value, label: categoryLabels[value] }));
const slaOptions = [
  { value: 'at_risk' as const, label: 'Fora do SLA' },
  { value: 'ok' as const, label: 'No prazo' },
];

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleString('pt-BR') : 'Não informado';
}

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

function isSlaAtRisk(ticket: SupportTicketSummary): boolean {
  if (!ticket.firstResponseDueAt || ticket.firstRespondedAt) return false;
  return Date.parse(ticket.firstResponseDueAt) < Date.now();
}

function parseParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function SupportFilterMenu<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T | null;
  options: readonly { value: T; label: string }[];
  onChange: (value: T | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const selectedLabel = value
    ? (options.find((option) => option.value === value)?.label ?? value)
    : 'Todos';

  return (
    <View style={styles.filterMenu}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((current) => !current)}
        style={[styles.filterTrigger, value !== null && styles.filterTriggerActive]}
      >
        <Text style={styles.filterTriggerLabel}>{label}</Text>
        <Text style={styles.filterTriggerValue} numberOfLines={1}>{selectedLabel}</Text>
      </Pressable>
      {open ? (
        <View style={styles.filterDropdown}>
          <Pressable
            accessibilityRole="menuitem"
            onPress={() => { onChange(null); setOpen(false); }}
            style={[styles.filterOption, value === null && styles.filterOptionActive]}
          >
            <Text style={[styles.filterOptionText, value === null && styles.filterOptionTextActive]}>Todos</Text>
          </Pressable>
          {options.map((option) => (
            <Pressable
              key={option.value}
              accessibilityRole="menuitem"
              onPress={() => { onChange(option.value); setOpen(false); }}
              style={[styles.filterOption, value === option.value && styles.filterOptionActive]}
            >
              <Text style={[
                styles.filterOptionText,
                value === option.value && styles.filterOptionTextActive,
              ]}
              >
                {option.label}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function RuntimeToggle({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      onPress={() => onChange(!value)}
      style={[styles.runtimeToggle, value && styles.runtimeToggleActive, disabled && styles.disabled]}
    >
      <Text style={[styles.runtimeToggleText, value && styles.runtimeToggleTextActive]}>
        {label}: {value ? 'ativo' : 'pausado'}
      </Text>
    </Pressable>
  );
}

function RuntimeControls({
  capabilities,
  onNotice,
  onSaved,
  compact,
}: {
  capabilities: SupportCapabilities;
  onNotice: (message: string) => void;
  onSaved: () => Promise<void>;
  compact?: boolean;
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
    onNotice('');
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
    <View style={[styles.runtimeInline, compact && styles.runtimeInlineFull]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((current) => !current)}
        style={styles.runtimeTrigger}
      >
        <Text style={styles.runtimeSummary} numberOfLines={1}>
          JSM {enabled ? 'ativo' : 'pausado'} · sync {syncEnabled ? 'on' : 'off'}
        </Text>
        <Text style={styles.runtimeConfigLink}>{expanded ? 'Ocultar' : 'Configurar'}</Text>
      </Pressable>
      {expanded ? (
        <View style={styles.runtimePanel}>
          <View style={styles.runtimeToggles}>
            <RuntimeToggle label="Módulo" value={enabled} disabled={busy} onChange={setEnabled} />
            <RuntimeToggle label="Novos" value={allowNewTickets} disabled={busy} onChange={setAllowNewTickets} />
            <RuntimeToggle label="Sync" value={syncEnabled} disabled={busy} onChange={setSyncEnabled} />
          </View>
          <TextInput
            editable={!busy}
            maxLength={300}
            onChangeText={setMaintenanceMessage}
            placeholder="Mensagem de manutenção"
            style={styles.input}
            value={maintenanceMessage}
          />
          <View style={styles.runtimeSaveRow}>
            <TextInput
              editable={!busy}
              maxLength={500}
              onChangeText={setReason}
              placeholder="Justificativa"
              style={[styles.input, styles.runtimeReason]}
              value={reason}
            />
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => { void save(); }}
              style={[styles.primaryButton, busy && styles.disabled]}
            >
              <Text style={styles.primaryButtonText}>{busy ? 'Salvando...' : 'Salvar'}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function TicketCard({
  ticket,
  selected,
  onPress,
  checked,
  onToggleCheck,
  selectable,
}: {
  ticket: SupportTicketSummary;
  selected: boolean;
  onPress: () => void;
  checked?: boolean;
  onToggleCheck?: () => void;
  selectable?: boolean;
}) {
  const slaRisk = isSlaAtRisk(ticket);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Abrir chamado ${ticket.protocol}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.ticketCard,
        selected && styles.ticketCardSelected,
        slaRisk && styles.ticketCardSlaRisk,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.ticketTopLine}>
        <View style={styles.ticketIdentity}>
          {selectable ? (
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: Boolean(checked) }}
              hitSlop={8}
              onPress={onToggleCheck}
              style={[styles.checkbox, checked && styles.checkboxChecked]}
            >
              <Text style={styles.checkboxMark}>{checked ? '✓' : ''}</Text>
            </Pressable>
          ) : null}
          <Text numberOfLines={1} style={styles.protocol}>{ticket.protocol}</Text>
        </View>
        <Text style={[styles.tag, styles[`priority_${ticket.priority}`]]}>
          {priorityLabels[ticket.priority]}
        </Text>
      </View>
      <Text numberOfLines={1} style={styles.ticketClient}>
        {ticket.requesterDisplayName ?? ticket.locationLabel ?? 'Cliente não identificado'}
      </Text>
      <Text numberOfLines={2} style={styles.ticketSubject}>{ticket.subject}</Text>
      <View style={styles.ticketMetadata}>
        <Text style={styles.tagNeutral}>{statusLabels[ticket.status]}</Text>
        <Text style={[styles.tagNeutral, slaRisk && styles.slaRiskText]}>
          {slaRisk ? '⚠ SLA fora' : '✓ SLA ok'}
        </Text>
      </View>
    </Pressable>
  );
}

export function SupportOperations() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    ticketId?: string | string[];
    status?: string | string[];
    priority?: string | string[];
    sla?: string | string[];
  }>();
  const { width } = useWindowDimensions();
  const { can, context } = useControlAuth();
  const canRead = can('control.support.read');
  const canManage = can('control.support.manage');
  const compact = width < 900;
  const selectedTicketId = parseParam(params.ticketId);

  const initialStatus = parseParam(params.status);
  const initialPriority = parseParam(params.priority);
  const initialSla = parseParam(params.sla);

  const [statusFilter, setStatusFilter] = useState<SupportStatus | null>(
    initialStatus && (supportStatuses as readonly string[]).includes(initialStatus)
      ? (initialStatus as SupportStatus)
      : null,
  );
  const [priorityFilter, setPriorityFilter] = useState<SupportPriority | null>(
    initialPriority && (supportPriorities as readonly string[]).includes(initialPriority)
      ? (initialPriority as SupportPriority)
      : null,
  );
  const [categoryFilter, setCategoryFilter] = useState<SupportCategory | null>(null);
  const [slaFilter, setSlaFilter] = useState<'all' | 'at_risk' | 'ok'>(
    initialSla === 'at_risk' || initialSla === 'ok' ? initialSla : 'all',
  );
  const [queueQuery, setQueueQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [overview, setOverview] = useState<SupportOverview | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [overviewError, setOverviewError] = useState('');
  const [detail, setDetail] = useState<SupportTicketDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [actionReason, setActionReason] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [jiraAccountId, setJiraAccountId] = useState('');
  const [membershipReason, setMembershipReason] = useState('');
  const [membershipBusy, setMembershipBusy] = useState(false);
  const overviewRequest = useRef(0);
  const detailRequest = useRef(0);
  const liveRefreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadOverview = useCallback(async (before: string | null = null) => {
    const requestId = ++overviewRequest.current;
    if (before) setLoadingMore(true);
    else {
      setOverview(null);
      setOverviewLoading(true);
    }
    setOverviewError('');
    try {
      const result = await getControlSupportOverview({
        status: statusFilter,
        priority: priorityFilter,
        category: categoryFilter,
        limit: 25,
        before,
      });
      if (requestId !== overviewRequest.current) return;
      setOverview((current) => {
        if (!before || !current) return result;
        const tickets = new Map(current.tickets.map((ticket) => [ticket.id, ticket]));
        result.tickets.forEach((ticket) => tickets.set(ticket.id, ticket));
        return { ...result, tickets: [...tickets.values()] };
      });
    } catch (error) {
      if (requestId === overviewRequest.current) setOverviewError(errorMessage(error));
    } finally {
      if (requestId === overviewRequest.current) {
        setOverviewLoading(false);
        setLoadingMore(false);
      }
    }
  }, [categoryFilter, priorityFilter, statusFilter]);

  const loadDetail = useCallback(async () => {
    const requestId = ++detailRequest.current;
    if (!selectedTicketId) {
      setDetail(null);
      setDetailError('');
      return;
    }
    if (!isSupportTicketId(selectedTicketId)) {
      setDetail(null);
      setDetailError('O identificador do chamado na URL é inválido.');
      return;
    }
    setDetailLoading(true);
    setDetail(null);
    setDetailError('');
    try {
      const result = await getControlSupportTicket(selectedTicketId);
      if (requestId === detailRequest.current) setDetail(result);
    } catch (error) {
      if (requestId === detailRequest.current) {
        setDetail(null);
        setDetailError(errorMessage(error));
      }
    } finally {
      if (requestId === detailRequest.current) setDetailLoading(false);
    }
  }, [selectedTicketId]);

  useFocusEffect(useCallback(() => {
    if (canRead) void loadOverview();
    return () => { overviewRequest.current += 1; };
  }, [canRead, loadOverview]));

  useFocusEffect(useCallback(() => {
    if (canRead) void loadDetail();
    return () => { detailRequest.current += 1; };
  }, [canRead, loadDetail]));

  const refresh = useCallback(async () => {
    await Promise.all([loadOverview(), loadDetail()]);
  }, [loadDetail, loadOverview]);

  useEffect(() => {
    if (!canRead) return undefined;
    let active = true;
    let unsubscribe: (() => void) | null = null;

    void subscribeToControlLive({
      onInvalidate: (scope) => {
        if (!active || (scope && scope !== 'support')) return;
        if (liveRefreshTimer.current) clearTimeout(liveRefreshTimer.current);
        liveRefreshTimer.current = setTimeout(() => {
          liveRefreshTimer.current = null;
          void refresh();
        }, 350);
      },
    }).then((cleanup) => {
      if (!active) {
        cleanup();
        return;
      }
      unsubscribe = cleanup;
    }).catch(() => {
      // Manual refresh and route focus remain available if Realtime is offline.
    });

    return () => {
      active = false;
      unsubscribe?.();
      if (liveRefreshTimer.current) {
        clearTimeout(liveRefreshTimer.current);
        liveRefreshTimer.current = null;
      }
    };
  }, [canRead, refresh]);

  const runTicketAction = useCallback(async (
    action: 'reprocess' | 'escalate',
    level?: Exclude<SupportEscalationLevel, 0>,
  ) => {
    if (!canManage || !detail || actionReason.trim().length < 10) {
      setNotice('Informe uma justificativa com pelo menos 10 caracteres.');
      return;
    }
    setActionBusy(true);
    setNotice('');
    try {
      if (action === 'reprocess') {
        await reprocessSupportSync(detail.ticket.id, actionReason);
        setNotice('Sincronização recolocada na fila.');
      } else if (level) {
        await escalateSupportTicket(detail.ticket.id, level, actionReason);
        setNotice(`Chamado escalado para L${level}.`);
      }
      setActionReason('');
      await refresh();
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setActionBusy(false);
    }
  }, [actionReason, canManage, detail, refresh]);

  const configureOwnMembership = useCallback(async () => {
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
    setNotice('');
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
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setMembershipBusy(false);
    }
  }, [canManage, context, jiraAccountId, loadOverview, membershipReason]);

  const openJira = useCallback(async () => {
    if (!detail?.ticket.jsmIssueUrl) return;
    try {
      await Linking.openURL(detail.ticket.jsmIssueUrl);
    } catch {
      setNotice('Não foi possível abrir o chamado no Jira.');
    }
  }, [detail?.ticket.jsmIssueUrl]);

  const activeMember = Boolean(overview?.operator.active && overview.operator.memberRole);
  const showOwnerSetup = Boolean(
    overview
    && !activeMember
    && canManage
    && context?.role === 'SaaS_Owner',
  );
  const showQueue = activeMember;
  const showOverviewPanels = !compact || !selectedTicketId;
  const detailOpen = Boolean(selectedTicketId);
  const showList = showQueue && (!compact || !detailOpen);
  const showDetail = showQueue && detailOpen;
  const splitDesktop = showQueue && !compact && detailOpen;
  const createTicketAction = resolveCloudActionAvailability({
    action: 'create_support_ticket',
    can,
    allowNewTickets: overview?.capabilities?.allowNewTickets ?? false,
  });

  const filteredTickets = (overview?.tickets ?? []).filter((ticket) => {
    const needle = queueQuery.trim().toLowerCase();
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
    if (slaFilter === 'at_risk' && !isSlaAtRisk(ticket)) return false;
    if (slaFilter === 'ok' && isSlaAtRisk(ticket)) return false;
    return true;
  });

  const activeFilterChips = useMemo(() => {
    const chips: { key: string; label: string; clear: () => void }[] = [];
    if (statusFilter) {
      chips.push({
        key: 'status',
        label: `Status: ${statusLabels[statusFilter]}`,
        clear: () => setStatusFilter(null),
      });
    }
    if (priorityFilter) {
      chips.push({
        key: 'priority',
        label: `Prioridade: ${priorityLabels[priorityFilter]}`,
        clear: () => setPriorityFilter(null),
      });
    }
    if (categoryFilter) {
      chips.push({
        key: 'category',
        label: `Área: ${categoryLabels[categoryFilter]}`,
        clear: () => setCategoryFilter(null),
      });
    }
    if (slaFilter !== 'all') {
      chips.push({
        key: 'sla',
        label: `SLA: ${slaFilter === 'at_risk' ? 'Fora do SLA' : 'No prazo'}`,
        clear: () => setSlaFilter('all'),
      });
    }
    return chips;
  }, [categoryFilter, priorityFilter, slaFilter, statusFilter]);

  const clearFilters = () => {
    setStatusFilter(null);
    setPriorityFilter(null);
    setCategoryFilter(null);
    setSlaFilter('all');
    setQueueQuery('');
  };

  const toggleSelected = (ticketId: string) => {
    setSelectedIds((current) => (
      current.includes(ticketId)
        ? current.filter((id) => id !== ticketId)
        : [...current, ticketId]
    ));
  };

  const closeDetail = () => {
    if (compact) {
      router.replace(CLOUD_ROUTES.suporte.atendimentos);
      return;
    }
    router.setParams({ ticketId: undefined });
  };

  return (
    <View style={styles.content}>
      <View style={styles.pageHeader}>
        <View style={styles.pageHeaderText}>
          <Text style={styles.kicker}>SUPORTE / ATENDIMENTOS</Text>
          <Text style={styles.pageTitle}>Estação da fila</Text>
          <Text style={styles.pageLead}>
            {overview
              ? `${filteredTickets.length} chamados na visão filtrada · total ${overview.counts.total}`
              : 'Fila operacional com tabela e detalhe contínuo.'}
          </Text>
        </View>
        <View style={styles.pageActions}>
          <Pressable
            accessibilityRole="button"
            disabled={overviewLoading}
            onPress={() => { void refresh(); }}
            style={[styles.secondaryButton, overviewLoading && styles.disabled]}
          >
            <Text style={styles.secondaryButtonText}>Atualizar</Text>
          </Pressable>
          {createTicketAction.visible ? (
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
                {createTicketAction.enabled ? 'Novo atendimento' : 'Novo atendimento — indisponível'}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
      {createTicketAction.visible && createTicketAction.reason && !createTicketAction.enabled ? (
        <Text style={styles.muted}>{createTicketAction.reason}</Text>
      ) : null}

      {notice ? <Text accessibilityRole="alert" style={styles.notice}>{notice}</Text> : null}

      {overviewLoading && !overview ? (
        <View style={styles.loadingLine}>
          <ActivityIndicator color="#173d2b" />
          <Text style={styles.muted}>Atualizando a fila de suporte...</Text>
        </View>
      ) : null}

      {overviewError ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>{overviewError}</Text>
          <Pressable accessibilityRole="button" onPress={() => { void loadOverview(); }} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Tentar novamente</Text>
          </Pressable>
        </View>
      ) : null}

      {showOwnerSetup ? (
        <View style={styles.setupCard}>
          <Text style={styles.cardEyebrow}>PRIMEIRO OPERADOR</Text>
          <Text style={styles.cardTitle}>Vincule sua conta de agente do Jira</Text>
          <Text style={styles.muted}>
            Você será cadastrado como líder da equipe SUPORTE_GERAL. A conta técnica da integração permanece separada.
          </Text>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            editable={!membershipBusy}
            onChangeText={setJiraAccountId}
            placeholder="Jira account ID"
            style={styles.input}
            value={jiraAccountId}
          />
          <TextInput
            editable={!membershipBusy}
            maxLength={500}
            multiline
            onChangeText={setMembershipReason}
            placeholder="Justificativa para o vínculo"
            style={[styles.input, styles.reasonInput]}
            value={membershipReason}
          />
          <Pressable
            accessibilityRole="button"
            disabled={membershipBusy}
            onPress={() => { void configureOwnMembership(); }}
            style={[styles.primaryButton, membershipBusy && styles.disabled]}
          >
            <Text style={styles.primaryButtonText}>{membershipBusy ? 'Vinculando...' : 'Vincular à equipe geral'}</Text>
          </Pressable>
        </View>
      ) : null}

      {overview && !activeMember && !showOwnerSetup ? (
        <View style={styles.infoCard}>
          <Text style={styles.cardTitle}>Equipe de suporte não vinculada</Text>
          <Text style={styles.muted}>
            Seu acesso ao Cloud está ativo, mas a projeção dos chamados exige participação em uma equipe de suporte.
          </Text>
        </View>
      ) : null}

      {overview && showQueue && showOverviewPanels ? (
        <>
          <View style={styles.contextStrip}>
            <View style={styles.contextMetrics}>
              <StripMetric label="Total" value={overview.counts.total} />
              <View style={styles.contextDivider} />
              <StripMetric label="Em andamento" value={overview.counts.inProgress} />
              <View style={styles.contextDivider} />
              <StripMetric label="Risco SLA" value={overview.counts.slaAtRisk} tone="warning" />
              <View style={styles.contextDivider} />
              <StripMetric label="Críticos" value={overview.counts.critical} tone="danger" />
              <View style={styles.contextDivider} />
              <StripMetric label="Sync falhas" value={overview.counts.syncFailed} tone="danger" />
            </View>
            <View style={styles.contextRight}>
              <Text style={styles.operatorCompact} numberOfLines={1}>
                {overview.operator.name}
                {overview.operator.memberRole
                  ? ` · ${overview.operator.memberRole === 'lead' ? 'Liderança' : 'Agente'}`
                  : ''}
              </Text>
              {overview.capabilities && canManage && context?.role === 'SaaS_Owner' ? (
                <RuntimeControls
                  capabilities={overview.capabilities}
                  onNotice={setNotice}
                  onSaved={() => loadOverview()}
                  compact={compact}
                />
              ) : overview.capabilities ? (
                <Text style={styles.runtimeSummary} numberOfLines={1}>
                  JSM {overview.capabilities.enabled ? 'ativo' : 'pausado'}
                  {' · '}
                  sync {overview.capabilities.syncEnabled ? 'on' : 'off'}
                </Text>
              ) : (
                <Text style={styles.runtimeSummary}>Projeção JSM</Text>
              )}
            </View>
          </View>

          <View style={styles.filtersBar}>
            <View style={styles.searchWrap}>
              <ContextualSearch
                value={queueQuery}
                onChangeText={setQueueQuery}
                placeholder="Filtrar por cliente, protocolo ou motivo"
              />
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterMenus}
            >
              <SupportFilterMenu
                label="Status"
                value={statusFilter}
                options={statusOptions}
                onChange={setStatusFilter}
              />
              <SupportFilterMenu
                label="Prioridade"
                value={priorityFilter}
                options={priorityOptions}
                onChange={setPriorityFilter}
              />
              <SupportFilterMenu
                label="Área"
                value={categoryFilter}
                options={categoryOptions}
                onChange={setCategoryFilter}
              />
              <SupportFilterMenu
                label="SLA"
                value={slaFilter === 'all' ? null : slaFilter}
                options={slaOptions}
                onChange={(value) => setSlaFilter(value ?? 'all')}
              />
            </ScrollView>
          </View>

          {activeFilterChips.length > 0 ? (
            <View style={styles.chipRow}>
              {activeFilterChips.map((chip) => (
                <Pressable
                  key={chip.key}
                  accessibilityRole="button"
                  onPress={chip.clear}
                  style={styles.activeChip}
                >
                  <Text style={styles.activeChipText}>{chip.label} ×</Text>
                </Pressable>
              ))}
              <Pressable accessibilityRole="button" onPress={clearFilters} style={styles.clearChip}>
                <Text style={styles.clearChipText}>Limpar</Text>
              </Pressable>
            </View>
          ) : null}

          {canManage && selectedIds.length > 0 ? (
            <View style={styles.batchBar}>
              <Text style={styles.muted}>{selectedIds.length} selecionado(s)</Text>
              <StatusBadge label="LOTE BLOQUEADO" tone="warning" />
              <Text style={styles.muted}>
                Ações em lote aguardam RPC homologada. Use as ações do detalhe para mutações autorizadas.
              </Text>
            </View>
          ) : null}
        </>
      ) : null}

      {overview && showQueue ? (
        <View style={[styles.workspace, compact && styles.workspaceCompact]}>
          {showList ? (
            <View
              style={[
                styles.listPanel,
                compact && styles.fullPanel,
                !compact && !splitDesktop && styles.listPanelFull,
                splitDesktop && styles.listPanelSplit,
              ]}
            >
              {!compact ? (
                <View style={styles.desktopTable}>
                  <View style={styles.desktopHeader}>
                    {canManage ? <Text style={[styles.desktopHeadCell, styles.desktopCheckCol]} /> : null}
                    <Text style={[styles.desktopHeadCell, styles.desktopPrimaryCol]}>Cliente</Text>
                    {!splitDesktop ? (
                      <Text style={[styles.desktopHeadCell, styles.desktopFlex]}>Motivo</Text>
                    ) : null}
                    <Text style={[styles.desktopHeadCell, styles.desktopFixedCol]}>Prioridade</Text>
                    <Text style={[styles.desktopHeadCell, styles.desktopFixedCol]}>SLA</Text>
                    <Text style={[styles.desktopHeadCell, styles.desktopStatusCol]}>Status</Text>
                  </View>
                  <ScrollView style={styles.tableScroll} nestedScrollEnabled>
                    {filteredTickets.map((ticket) => {
                      const slaRisk = isSlaAtRisk(ticket);
                      return (
                        <Pressable
                          key={ticket.id}
                          accessibilityRole="button"
                          onPress={() => router.setParams({ ticketId: ticket.id })}
                          style={({ pressed }) => [
                            styles.desktopRow,
                            ticket.id === selectedTicketId && styles.desktopRowSelected,
                            slaRisk && styles.desktopRowSlaRisk,
                            pressed && styles.rowHover,
                          ]}
                        >
                          {canManage ? (
                            <Pressable
                              accessibilityRole="checkbox"
                              accessibilityState={{ checked: selectedIds.includes(ticket.id) }}
                              onPress={() => toggleSelected(ticket.id)}
                              style={[
                                styles.checkbox,
                                selectedIds.includes(ticket.id) && styles.checkboxChecked,
                                styles.desktopCheckCol,
                              ]}
                            >
                              <Text style={styles.checkboxMark}>
                                {selectedIds.includes(ticket.id) ? '✓' : ''}
                              </Text>
                            </Pressable>
                          ) : null}
                          <View style={styles.desktopPrimaryCol}>
                            <Text numberOfLines={1} style={styles.ticketClient}>
                              {ticket.requesterDisplayName ?? ticket.locationLabel ?? '—'}
                            </Text>
                            <Text numberOfLines={1} style={styles.protocol}>{ticket.protocol}</Text>
                            {splitDesktop ? (
                              <Text numberOfLines={1} style={styles.ticketSubjectMuted}>{ticket.subject}</Text>
                            ) : null}
                          </View>
                          {!splitDesktop ? (
                            <Text numberOfLines={2} style={[styles.ticketSubject, styles.desktopFlex]}>
                              {ticket.subject}
                            </Text>
                          ) : null}
                          <Text
                            numberOfLines={1}
                            style={[
                              styles.tag,
                              styles.desktopFixedCol,
                              styles[`priority_${ticket.priority}`],
                            ]}
                          >
                            {priorityLabels[ticket.priority]}
                          </Text>
                          <Text
                            numberOfLines={1}
                            style={[
                              styles.tagNeutral,
                              styles.desktopFixedCol,
                              slaRisk && styles.slaRiskText,
                            ]}
                          >
                            {slaRisk ? '⚠ Fora' : '✓ Ok'}
                          </Text>
                          <Text numberOfLines={1} style={[styles.tagNeutral, styles.desktopStatusCol]}>
                            {statusLabels[ticket.status]}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>
              ) : (
                <View style={styles.ticketList}>
                  {filteredTickets.map((ticket) => (
                    <TicketCard
                      key={ticket.id}
                      ticket={ticket}
                      selected={ticket.id === selectedTicketId}
                      selectable={canManage}
                      checked={selectedIds.includes(ticket.id)}
                      onToggleCheck={() => toggleSelected(ticket.id)}
                      onPress={() => router.setParams({ ticketId: ticket.id })}
                    />
                  ))}
                </View>
              )}

              {!overviewLoading && filteredTickets.length === 0 ? (
                <Text style={styles.empty}>Nenhum chamado corresponde aos filtros atuais.</Text>
              ) : null}
              {overview.nextCursor ? (
                <Pressable
                  accessibilityRole="button"
                  disabled={loadingMore}
                  onPress={() => { void loadOverview(overview.nextCursor); }}
                  style={[styles.secondaryButton, loadingMore && styles.disabled]}
                >
                  <Text style={styles.secondaryButtonText}>{loadingMore ? 'Carregando...' : 'Carregar mais'}</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          {showDetail ? (
            <View style={[styles.detailPanel, compact && styles.fullPanel, splitDesktop && styles.detailPanelSplit]}>
              <View style={styles.detailToolbar}>
                <Pressable accessibilityRole="button" onPress={closeDetail} style={styles.backButton}>
                  <Text style={styles.backButtonText}>
                    {compact ? '← Voltar para a fila' : 'Fechar detalhe'}
                  </Text>
                </Pressable>
                {detail?.ticket.jsmIssueUrl ? (
                  <Pressable accessibilityRole="link" onPress={() => { void openJira(); }} style={styles.jiraButton}>
                    <Text style={styles.jiraButtonText}>Responder no Jira</Text>
                  </Pressable>
                ) : null}
              </View>

              {detailLoading ? (
                <View style={styles.loadingLine}>
                  <ActivityIndicator color="#173d2b" />
                  <Text style={styles.muted}>Carregando chamado...</Text>
                </View>
              ) : null}

              {detailError ? (
                <View style={styles.errorCard}>
                  <Text style={styles.errorText}>{detailError}</Text>
                  {isSupportTicketId(selectedTicketId) ? (
                    <Pressable accessibilityRole="button" onPress={() => { void loadDetail(); }} style={styles.secondaryButton}>
                      <Text style={styles.secondaryButtonText}>Tentar novamente</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}

              {detail ? (
                <>
                  <View style={styles.detailHeader}>
                    <Text style={styles.protocol}>{detail.ticket.protocol}</Text>
                    <Text style={styles.detailTitle}>{detail.ticket.subject}</Text>
                    <Text style={[styles.tag, styles[`priority_${detail.ticket.priority}`]]}>
                      {priorityLabels[detail.ticket.priority]}
                    </Text>
                  </View>

                  <View style={styles.definitionList}>
                    <DefRow label="Status" value={statusLabels[detail.ticket.status]} />
                    <DefRow label="Área" value={categoryLabels[detail.ticket.category]} />
                    <DefRow label="Solicitante" value={detail.ticket.requesterDisplayName ?? 'Identidade minimizada'} />
                    <DefRow label="Localização" value={detail.ticket.locationLabel ?? 'Contexto global'} />
                    <DefRow label="Escalonamento" value={`L${detail.ticket.escalationLevel}`} />
                    <DefRow label="Primeira resposta" value={formatDate(detail.ticket.firstResponseDueAt)} />
                    <DefRow label="Sincronização" value={detail.ticket.syncStatus} />
                    <DefRow label="JSM" value={detail.ticket.jsmIssueKey ?? 'Ainda não criado'} />
                  </View>

                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Conversa</Text>
                    {detail.messages.map((message) => (
                      <View
                        key={message.id}
                        style={[styles.message, message.authorKind === 'support' && styles.supportMessage]}
                      >
                        <View style={styles.messageHeader}>
                          <Text style={styles.messageAuthor}>{message.authorDisplayName}</Text>
                          <Text style={styles.ticketDate}>{formatDate(message.createdAt)}</Text>
                        </View>
                        <Text selectable style={styles.messageBody}>{message.body}</Text>
                      </View>
                    ))}
                    {detail.messages.length === 0 ? (
                      <Text style={styles.empty}>Nenhuma mensagem pública sincronizada.</Text>
                    ) : null}
                  </View>

                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Histórico</Text>
                    {detail.events.length ? detail.events.slice(-8).map((event) => (
                      <View key={event.id} style={styles.event}>
                        <Text style={styles.eventType}>{event.eventType}</Text>
                        <Text style={styles.muted}>
                          {event.actorDisplayName ?? 'Sistema'} · {formatDate(event.createdAt)}
                        </Text>
                      </View>
                    )) : (
                      <Text style={styles.empty}>Sem eventos operacionais nesta sessão.</Text>
                    )}
                  </View>

                  {canManage ? (
                    <View style={styles.section}>
                      <Text style={styles.sectionTitle}>Ações</Text>
                      <Text style={styles.muted}>
                        As respostas continuam no Jira. Informe uma justificativa para reprocessar ou escalar.
                      </Text>
                      <TextInput
                        editable={!actionBusy}
                        maxLength={500}
                        multiline
                        onChangeText={setActionReason}
                        placeholder="Justificativa da ação"
                        style={[styles.input, styles.reasonInput]}
                        value={actionReason}
                      />
                      <View style={styles.actionButtons}>
                        <Pressable
                          accessibilityRole="button"
                          disabled={actionBusy}
                          onPress={() => { void runTicketAction('reprocess'); }}
                          style={[styles.secondaryButton, actionBusy && styles.disabled]}
                        >
                          <Text style={styles.secondaryButtonText}>Reprocessar sincronização</Text>
                        </Pressable>
                        {([1, 2, 3] as const).map((level) => (
                          <Pressable
                            accessibilityRole="button"
                            disabled={actionBusy || detail.ticket.escalationLevel >= level}
                            key={level}
                            onPress={() => { void runTicketAction('escalate', level); }}
                            style={[
                              styles.escalationButton,
                              (actionBusy || detail.ticket.escalationLevel >= level) && styles.disabled,
                            ]}
                          >
                            <Text style={styles.escalationButtonText}>Escalar L{level}</Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>
                  ) : null}
                </>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function StripMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: 'danger' | 'warning';
}) {
  return (
    <View style={styles.stripMetric}>
      <Text style={styles.stripMetricLabel}>{label}</Text>
      <Text
        style={[
          styles.stripMetricValue,
          tone === 'danger' && styles.dangerText,
          tone === 'warning' && styles.warningText,
        ]}
      >
        {value.toLocaleString('pt-BR')}
      </Text>
    </View>
  );
}

function DefRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.defRow}>
      <Text style={styles.defLabel}>{label}</Text>
      <Text style={styles.defValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { width: '100%', gap: 14 },
  pageHeader: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
  },
  pageHeaderText: { flex: 1, minWidth: 240, gap: 4 },
  kicker: { color: '#7b857e', fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  pageTitle: { color: '#17231c', fontSize: 24, fontWeight: '800' },
  pageLead: { color: '#667269', fontSize: 13, lineHeight: 18 },
  pageActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  loadingLine: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  notice: {
    padding: 12,
    borderWidth: 1,
    borderColor: '#b8d8c5',
    borderRadius: 6,
    backgroundColor: '#f0faf4',
    color: '#285f43',
    fontWeight: '600',
  },
  errorCard: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e6c8c4',
    borderRadius: 6,
    backgroundColor: '#fff7f6',
  },
  errorText: { flex: 1, minWidth: 220, color: '#8d3831' },
  setupCard: {
    width: '100%',
    maxWidth: 680,
    gap: 12,
    padding: 18,
    borderWidth: 1,
    borderColor: '#d3ddd5',
    borderRadius: 6,
    backgroundColor: '#ffffff',
  },
  infoCard: {
    width: '100%',
    maxWidth: 680,
    gap: 8,
    padding: 18,
    borderWidth: 1,
    borderColor: '#d8dfd8',
    borderRadius: 6,
    backgroundColor: '#ffffff',
  },
  cardEyebrow: { color: '#347452', fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
  cardTitle: { color: '#17231c', fontSize: 16, fontWeight: '800' },
  muted: { color: '#667269', fontSize: 12, lineHeight: 18 },
  input: {
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#cbd4cc',
    borderRadius: 6,
    backgroundColor: '#fbfcfb',
    color: '#17231c',
  },
  reasonInput: { minHeight: 82, textAlignVertical: 'top' },
  primaryButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: 6,
    backgroundColor: '#173d2b',
  },
  primaryButtonText: { color: '#ffffff', fontWeight: '800', fontSize: 12 },
  secondaryButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#bdc9bf',
    borderRadius: 6,
    backgroundColor: '#ffffff',
  },
  secondaryButtonText: { color: '#274936', fontWeight: '700', fontSize: 12 },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.8 },
  contextStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'stretch',
    justifyContent: 'space-between',
    gap: 12,
    borderWidth: 1,
    borderColor: '#d8dfd8',
    borderRadius: 6,
    backgroundColor: '#ffffff',
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  contextMetrics: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', flex: 1, minWidth: 260 },
  contextDivider: { width: 1, alignSelf: 'stretch', backgroundColor: '#e2e7e2', marginHorizontal: 8 },
  stripMetric: { gap: 2, minWidth: 72, paddingVertical: 4 },
  stripMetricLabel: { color: '#7b857e', fontSize: 10, fontWeight: '700' },
  stripMetricValue: { color: '#173d2b', fontSize: 18, fontWeight: '900' },
  dangerText: { color: '#9a3f37' },
  warningText: { color: '#916421' },
  contextRight: { minWidth: 180, maxWidth: 320, gap: 6, justifyContent: 'center' },
  operatorCompact: { color: '#17231c', fontSize: 12, fontWeight: '700' },
  runtimeInline: { gap: 8 },
  runtimeInlineFull: { width: '100%' },
  runtimeTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    minHeight: 36,
  },
  runtimeSummary: { color: '#526158', fontSize: 11, fontWeight: '700', flex: 1 },
  runtimeConfigLink: { color: '#285f43', fontSize: 11, fontWeight: '800' },
  runtimePanel: { gap: 8, paddingTop: 4 },
  runtimeToggles: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  runtimeToggle: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#d3dbd4',
    borderRadius: 6,
    backgroundColor: '#f5f7f4',
  },
  runtimeToggleActive: { borderColor: '#347452', backgroundColor: '#e3f2e8' },
  runtimeToggleText: { color: '#667269', fontSize: 11, fontWeight: '800' },
  runtimeToggleTextActive: { color: '#285f43' },
  runtimeSaveRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  runtimeReason: { minWidth: 180, flex: 1 },
  filtersBar: { gap: 10 },
  searchWrap: { width: '100%' },
  filterMenus: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingRight: 8, zIndex: 20 },
  filterMenu: { position: 'relative', zIndex: 30 },
  filterTrigger: {
    minHeight: 44,
    minWidth: 118,
    justifyContent: 'center',
    gap: 2,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#d3dbd4',
    borderRadius: 6,
    backgroundColor: '#ffffff',
  },
  filterTriggerActive: { borderColor: '#27523b', backgroundColor: '#f3f8f4' },
  filterTriggerLabel: { color: '#7b857e', fontSize: 10, fontWeight: '800' },
  filterTriggerValue: { color: '#17231c', fontSize: 12, fontWeight: '700', maxWidth: 140 },
  filterDropdown: {
    position: 'absolute',
    top: 48,
    left: 0,
    minWidth: 180,
    maxHeight: 260,
    borderWidth: 1,
    borderColor: '#d3dbd4',
    borderRadius: 6,
    backgroundColor: '#ffffff',
    zIndex: 40,
    elevation: 4,
    overflow: 'hidden',
  },
  filterOption: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eef1ee',
  },
  filterOptionActive: { backgroundColor: '#f0f8f3' },
  filterOptionText: { color: '#344239', fontSize: 12, fontWeight: '600' },
  filterOptionTextActive: { color: '#173d2b', fontWeight: '800' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  activeChip: {
    minHeight: 32,
    justifyContent: 'center',
    paddingHorizontal: 10,
    borderRadius: 4,
    backgroundColor: '#eef2ef',
  },
  activeChipText: { color: '#274936', fontSize: 11, fontWeight: '700' },
  clearChip: { minHeight: 32, justifyContent: 'center', paddingHorizontal: 8 },
  clearChipText: { color: '#285f43', fontSize: 11, fontWeight: '800' },
  batchBar: {
    gap: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e6d4a8',
    borderRadius: 6,
    backgroundColor: '#fffbf1',
  },
  workspace: {
    width: '100%',
    minHeight: 560,
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 14,
  },
  workspaceCompact: { minHeight: 0, flexDirection: 'column' },
  listPanel: {
    gap: 10,
    minWidth: 0,
  },
  listPanelFull: { flex: 1, width: '100%' },
  listPanelSplit: {
    flexGrow: 1.75,
    flexShrink: 1,
    flexBasis: '58%',
    minWidth: 520,
  },
  detailPanel: {
    minWidth: 0,
    flex: 1,
    gap: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#d8dfd8',
    borderRadius: 6,
    backgroundColor: '#ffffff',
  },
  detailPanelSplit: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '36%',
    minWidth: 380,
    maxWidth: 440,
  },
  fullPanel: { width: '100%' },
  desktopTable: {
    width: '100%',
    borderWidth: 1,
    borderColor: '#d8dfd8',
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: '#ffffff',
    maxHeight: 640,
  },
  tableScroll: { maxHeight: 580 },
  desktopHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#f5f7f4',
    borderBottomWidth: 1,
    borderBottomColor: '#d8dfd8',
    position: 'sticky' as never,
    top: 0,
    zIndex: 2,
  },
  desktopRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e7ebe7',
    backgroundColor: '#ffffff',
  },
  desktopRowSelected: { backgroundColor: '#f3f7f4' },
  desktopRowSlaRisk: { borderLeftWidth: 3, borderLeftColor: '#c9892f' },
  rowHover: { backgroundColor: '#f8faf8' },
  desktopHeadCell: { color: '#7b857e', fontSize: 11, fontWeight: '800' },
  desktopFlex: { flex: 1.2, minWidth: 140 },
  desktopPrimaryCol: { flex: 1.4, minWidth: 160, gap: 2 },
  desktopFixedCol: { flexGrow: 0, flexShrink: 0, minWidth: 84, maxWidth: 96 },
  desktopStatusCol: { flexGrow: 0, flexShrink: 0, minWidth: 104, maxWidth: 124 },
  desktopCheckCol: { width: 28, minWidth: 28, flexShrink: 0 },
  ticketList: { gap: 8 },
  ticketCard: {
    minHeight: 44,
    gap: 6,
    padding: 12,
    borderWidth: 1,
    borderColor: '#d8dfd8',
    borderRadius: 6,
    backgroundColor: '#ffffff',
  },
  ticketCardSelected: { backgroundColor: '#f3f7f4' },
  ticketCardSlaRisk: { borderLeftWidth: 3, borderLeftColor: '#c9892f' },
  ticketTopLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  ticketIdentity: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 },
  protocol: {
    color: '#7b857e',
    fontSize: 11,
    fontWeight: '700',
    fontFamily: 'monospace',
    letterSpacing: 0.3,
  },
  ticketSubject: { color: '#344239', fontSize: 13, fontWeight: '600', lineHeight: 18 },
  ticketSubjectMuted: { color: '#667269', fontSize: 12, fontWeight: '600', marginTop: 2 },
  ticketClient: { color: '#17231c', fontSize: 13, fontWeight: '800' },
  ticketMetadata: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  ticketDate: { color: '#7b857e', fontSize: 12 },
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
  slaRiskText: { color: '#8b641d', backgroundColor: '#f8edd8', fontWeight: '800' },
  priority_critical: { color: '#ffffff', backgroundColor: '#9a3f37' },
  priority_high: { color: '#7d4d11', backgroundColor: '#f9e3bd' },
  priority_normal: { color: '#285f43', backgroundColor: '#dcefe3' },
  priority_low: { color: '#526158', backgroundColor: '#e9ece9' },
  checkbox: {
    width: 22,
    height: 22,
    borderWidth: 1,
    borderColor: '#bdc9bf',
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  checkboxChecked: { borderColor: '#27523b', backgroundColor: '#27523b' },
  checkboxMark: { color: '#ffffff', fontSize: 12, fontWeight: '800' },
  empty: { paddingVertical: 16, color: '#7b857e', fontSize: 12, textAlign: 'center' },
  detailToolbar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  backButton: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start', paddingHorizontal: 2 },
  backButtonText: { color: '#285f43', fontWeight: '800', fontSize: 12 },
  jiraButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: 6,
    backgroundColor: '#173d2b',
  },
  jiraButtonText: { color: '#ffffff', fontSize: 12, fontWeight: '800' },
  detailHeader: { gap: 6 },
  detailTitle: { color: '#17231c', fontSize: 20, fontWeight: '900', lineHeight: 26 },
  definitionList: {
    borderTopWidth: 1,
    borderTopColor: '#e7ebe7',
  },
  defRow: {
    flexDirection: 'row',
    gap: 12,
    minHeight: 40,
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e7ebe7',
  },
  defLabel: { width: 120, color: '#7b857e', fontSize: 11, fontWeight: '800' },
  defValue: { flex: 1, color: '#344239', fontSize: 12, fontWeight: '700' },
  section: {
    gap: 10,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e7ebe7',
  },
  sectionTitle: { color: '#17231c', fontSize: 14, fontWeight: '800' },
  message: {
    gap: 6,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eef1ee',
  },
  supportMessage: { backgroundColor: '#f7fbf8', paddingHorizontal: 8, marginHorizontal: -8 },
  messageHeader: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 },
  messageAuthor: { color: '#344239', fontSize: 12, fontWeight: '800' },
  messageBody: { color: '#344239', lineHeight: 20 },
  event: { gap: 2, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#e7ebe7' },
  eventType: { color: '#344239', fontSize: 12, fontWeight: '800' },
  actionButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  escalationButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#d6b8b3',
    borderRadius: 6,
    backgroundColor: '#fff7f6',
  },
  escalationButtonText: { color: '#8d3831', fontWeight: '800', fontSize: 12 },
});
