import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
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

function Metric({ label, value, tone }: { label: string; value: number; tone?: 'danger' | 'warning' }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, tone === 'danger' && styles.dangerText, tone === 'warning' && styles.warningText]}>
        {value.toLocaleString('pt-BR')}
      </Text>
    </View>
  );
}

function FilterGroup<T extends string>({
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
  return (
    <View style={styles.filterGroup}>
      <Text style={styles.filterLabel}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterOptions}>
        <Pressable
          accessibilityRole="button"
          onPress={() => onChange(null)}
          style={[styles.filterChip, value === null && styles.filterChipSelected]}
        >
          <Text style={[styles.filterChipText, value === null && styles.filterChipTextSelected]}>Todos</Text>
        </Pressable>
        {options.map((option) => (
          <Pressable
            accessibilityRole="button"
            key={option.value}
            onPress={() => onChange(option.value)}
            style={[styles.filterChip, value === option.value && styles.filterChipSelected]}
          >
            <Text style={[styles.filterChipText, value === option.value && styles.filterChipTextSelected]}>
              {option.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

function isSlaAtRisk(ticket: SupportTicketSummary): boolean {
  if (!ticket.firstResponseDueAt || ticket.firstRespondedAt) return false;
  return Date.parse(ticket.firstResponseDueAt) < Date.now();
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
        <Text style={[styles.priority, styles[`priority_${ticket.priority}`]]}>
          {priorityLabels[ticket.priority]}
        </Text>
      </View>
      <Text numberOfLines={2} style={styles.ticketSubject}>{ticket.subject}</Text>
      <Text numberOfLines={1} style={styles.ticketClient}>
        {ticket.requesterDisplayName ?? ticket.locationLabel ?? 'Cliente não identificado'}
      </Text>
      <View style={styles.ticketMetadata}>
        <Text style={styles.metadata}>{statusLabels[ticket.status]}</Text>
        <Text style={styles.metadata}>{categoryLabels[ticket.category]}</Text>
        <Text style={[styles.metadata, slaRisk && styles.slaRiskText]}>
          SLA {slaRisk ? 'fora do prazo' : 'no prazo'}
        </Text>
        <Text style={styles.metadata}>
          Resp. {ticket.assigneeProfileId ? ticket.assigneeProfileId.slice(0, 8) : 'não atribuído'}
        </Text>
      </View>
      <Text style={styles.ticketDate}>
        Última interação {formatDate(ticket.lastMessageAt ?? ticket.updatedAt)}
      </Text>
    </Pressable>
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
}: {
  capabilities: SupportCapabilities;
  onNotice: (message: string) => void;
  onSaved: () => Promise<void>;
}) {
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
    <View style={styles.runtimeCard}>
      <View style={styles.runtimeHeader}>
        <View>
          <Text style={styles.cardEyebrow}>CONTROLE DE RUNTIME</Text>
          <Text style={styles.cardTitle}>Disponibilidade do suporte</Text>
        </View>
        <Text style={styles.ownerBadge}>OWNER</Text>
      </View>
      <View style={styles.runtimeToggles}>
        <RuntimeToggle label="Módulo" value={enabled} disabled={busy} onChange={setEnabled} />
        <RuntimeToggle label="Novos chamados" value={allowNewTickets} disabled={busy} onChange={setAllowNewTickets} />
        <RuntimeToggle label="Sincronização" value={syncEnabled} disabled={busy} onChange={setSyncEnabled} />
      </View>
      <TextInput
        editable={!busy}
        maxLength={300}
        onChangeText={setMaintenanceMessage}
        placeholder="Mensagem de manutenção exibida aos usuários"
        style={styles.input}
        value={maintenanceMessage}
      />
      <View style={styles.runtimeSaveRow}>
        <TextInput
          editable={!busy}
          maxLength={500}
          onChangeText={setReason}
          placeholder="Justificativa da alteração"
          style={[styles.input, styles.runtimeReason]}
          value={reason}
        />
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() => { void save(); }}
          style={[styles.primaryButton, busy && styles.disabled]}
        >
          <Text style={styles.primaryButtonText}>{busy ? 'Salvando...' : 'Salvar runtime'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function SupportOperations() {
  const router = useRouter();
  const params = useLocalSearchParams<{ ticketId?: string | string[] }>();
  const { width } = useWindowDimensions();
  const { can, context } = useControlAuth();
  const canRead = can('control.support.read');
  const canManage = can('control.support.manage');
  const compact = width < 900;
  const selectedTicketId = Array.isArray(params.ticketId) ? params.ticketId[0] : params.ticketId;

  const [statusFilter, setStatusFilter] = useState<SupportStatus | null>(null);
  const [priorityFilter, setPriorityFilter] = useState<SupportPriority | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<SupportCategory | null>(null);
  const [slaFilter, setSlaFilter] = useState<'all' | 'at_risk' | 'ok'>('all');
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
  const showList = showQueue && (!compact || !selectedTicketId);
  const showDetail = showQueue && (!compact || Boolean(selectedTicketId));
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

  const toggleSelected = (ticketId: string) => {
    setSelectedIds((current) => (
      current.includes(ticketId)
        ? current.filter((id) => id !== ticketId)
        : [...current, ticketId]
    ));
  };

  return (
    <View style={styles.content}>
      {createTicketAction.visible ? (
        <View style={styles.setupCard}>
          <Text style={styles.cardTitle}>Novo atendimento</Text>
          <Text style={styles.muted}>
            {createTicketAction.reason
              ?? 'Criação liberada para operadores com permissão de gestão.'}
          </Text>
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
            <Text style={styles.primaryButtonText}>Novo atendimento</Text>
          </Pressable>
        </View>
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

      {overview && activeMember ? (
        <View style={styles.operatorLine}>
          <View>
            <Text style={styles.operatorName}>{overview.operator.name}</Text>
            <Text style={styles.muted}>
              {overview.operator.teamName ?? overview.operator.teamCode} · {overview.operator.memberRole === 'lead' ? 'Liderança' : 'Agente'}
            </Text>
          </View>
          <Text style={styles.liveBadge}>PROJEÇÃO JSM</Text>
        </View>
      ) : null}

      {overview?.capabilities && canManage && context?.role === 'SaaS_Owner' ? (
        <RuntimeControls
          capabilities={overview.capabilities}
          onNotice={setNotice}
          onSaved={() => loadOverview()}
        />
      ) : null}

      {overview && showQueue && showOverviewPanels ? (
        <>
          <View style={styles.metrics}>
            <Metric label="Total filtrado" value={overview.counts.total} />
            <Metric label="Em andamento" value={overview.counts.inProgress} />
            <Metric label="Aguardando usuário" value={overview.counts.waitingUser} />
            <Metric label="Críticos" value={overview.counts.critical} tone="danger" />
            <Metric label="Risco de SLA" value={overview.counts.slaAtRisk} tone="warning" />
            <Metric label="Falhas de sync" value={overview.counts.syncFailed} tone="danger" />
          </View>

          <View style={styles.filters}>
            <ContextualSearch
              value={queueQuery}
              onChangeText={setQueueQuery}
              placeholder="Filtrar por cliente, protocolo ou motivo"
            />
            <FilterGroup label="Status" value={statusFilter} options={statusOptions} onChange={setStatusFilter} />
            <FilterGroup label="Prioridade" value={priorityFilter} options={priorityOptions} onChange={setPriorityFilter} />
            <FilterGroup label="Área" value={categoryFilter} options={categoryOptions} onChange={setCategoryFilter} />
            <FilterGroup
              label="SLA"
              value={slaFilter === 'all' ? null : slaFilter}
              options={[
                { value: 'at_risk' as const, label: 'Fora do SLA' },
                { value: 'ok' as const, label: 'No prazo' },
              ]}
              onChange={(value) => setSlaFilter(value ?? 'all')}
            />
          </View>

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
            <View style={[styles.listPanel, compact && styles.fullPanel, !compact && styles.listPanelWide]}>
              <View style={styles.panelHeader}>
                <View>
                  <Text style={styles.cardTitle}>Chamados</Text>
                  <Text style={styles.muted}>
                    {filteredTickets.length} de {overview.tickets.length} · total filtrado {overview.counts.total}
                  </Text>
                </View>
                {overviewLoading ? (
                  <ActivityIndicator color="#173d2b" />
                ) : (
                  <Pressable accessibilityRole="button" onPress={() => { void refresh(); }} style={styles.refreshButton}>
                    <Text style={styles.refreshButtonText}>Atualizar</Text>
                  </Pressable>
                )}
              </View>

              {!compact ? (
                <View style={styles.desktopTable}>
                  <View style={styles.desktopHeader}>
                    {canManage ? <Text style={[styles.desktopHeadCell, styles.desktopCheckCol]} /> : null}
                    <Text style={[styles.desktopHeadCell, styles.desktopFlex]}>Cliente / protocolo</Text>
                    <Text style={[styles.desktopHeadCell, styles.desktopFlex]}>Motivo</Text>
                    <Text style={styles.desktopHeadCell}>Prioridade</Text>
                    <Text style={styles.desktopHeadCell}>SLA</Text>
                    <Text style={styles.desktopHeadCell}>Responsável</Text>
                    <Text style={styles.desktopHeadCell}>Status</Text>
                  </View>
                  {filteredTickets.map((ticket) => {
                    const slaRisk = isSlaAtRisk(ticket);
                    return (
                      <Pressable
                        key={ticket.id}
                        accessibilityRole="button"
                        onPress={() => router.setParams({ ticketId: ticket.id })}
                        style={[
                          styles.desktopRow,
                          ticket.id === selectedTicketId && styles.desktopRowSelected,
                          slaRisk && styles.desktopRowSlaRisk,
                        ]}
                      >
                        {canManage ? (
                          <Pressable
                            accessibilityRole="checkbox"
                            accessibilityState={{ checked: selectedIds.includes(ticket.id) }}
                            onPress={() => toggleSelected(ticket.id)}
                            style={[styles.checkbox, selectedIds.includes(ticket.id) && styles.checkboxChecked, styles.desktopCheckCol]}
                          >
                            <Text style={styles.checkboxMark}>
                              {selectedIds.includes(ticket.id) ? '✓' : ''}
                            </Text>
                          </Pressable>
                        ) : null}
                        <View style={styles.desktopFlex}>
                          <Text style={styles.protocol}>{ticket.protocol}</Text>
                          <Text numberOfLines={1} style={styles.ticketClient}>
                            {ticket.requesterDisplayName ?? ticket.locationLabel ?? '—'}
                          </Text>
                        </View>
                        <Text numberOfLines={2} style={[styles.ticketSubject, styles.desktopFlex]}>
                          {ticket.subject}
                        </Text>
                        <Text style={[styles.priority, styles[`priority_${ticket.priority}`]]}>
                          {priorityLabels[ticket.priority]}
                        </Text>
                        <Text style={[styles.metadata, slaRisk && styles.slaRiskText]}>
                          {slaRisk ? 'Fora do SLA' : 'No prazo'}
                        </Text>
                        <Text style={styles.metadata}>
                          {ticket.assigneeProfileId ? ticket.assigneeProfileId.slice(0, 8) : '—'}
                        </Text>
                        <Text style={styles.metadata}>{statusLabels[ticket.status]}</Text>
                      </Pressable>
                    );
                  })}
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
            <View style={[styles.detailPanel, compact && styles.fullPanel]}>
              {compact && selectedTicketId ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.replace(CLOUD_ROUTES.suporte.root)}
                  style={styles.backButton}
                >
                  <Text style={styles.backButtonText}>← Voltar para a fila</Text>
                </Pressable>
              ) : null}

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

              {!selectedTicketId && !detailLoading ? (
                <View style={styles.detailEmpty}>
                  <Text style={styles.cardTitle}>Selecione um chamado</Text>
                  <Text style={styles.muted}>O conteúdo público, o histórico e as ações aparecerão aqui.</Text>
                </View>
              ) : null}

              {detail ? (
                <>
                  <View style={styles.detailHeader}>
                    <View style={styles.detailTitleBlock}>
                      <Text style={styles.protocol}>{detail.ticket.protocol}</Text>
                      <Text style={styles.detailTitle}>{detail.ticket.subject}</Text>
                    </View>
                    <View style={styles.headerActions}>
                      <Text style={[styles.priority, styles[`priority_${detail.ticket.priority}`]]}>
                        {priorityLabels[detail.ticket.priority]}
                      </Text>
                      {detail.ticket.jsmIssueUrl ? (
                        <Pressable accessibilityRole="link" onPress={() => { void openJira(); }} style={styles.jiraButton}>
                          <Text style={styles.jiraButtonText}>Responder no Jira ↗</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  </View>

                  <View style={styles.detailGrid}>
                    <View style={styles.detailField}><Text style={styles.fieldLabel}>Status</Text><Text style={styles.fieldValue}>{statusLabels[detail.ticket.status]}</Text></View>
                    <View style={styles.detailField}><Text style={styles.fieldLabel}>Área</Text><Text style={styles.fieldValue}>{categoryLabels[detail.ticket.category]}</Text></View>
                    <View style={styles.detailField}><Text style={styles.fieldLabel}>Solicitante</Text><Text style={styles.fieldValue}>{detail.ticket.requesterDisplayName ?? 'Identidade minimizada'}</Text></View>
                    <View style={styles.detailField}><Text style={styles.fieldLabel}>Localização</Text><Text style={styles.fieldValue}>{detail.ticket.locationLabel ?? 'Contexto global'}</Text></View>
                    <View style={styles.detailField}><Text style={styles.fieldLabel}>Escalonamento</Text><Text style={styles.fieldValue}>L{detail.ticket.escalationLevel}</Text></View>
                    <View style={styles.detailField}><Text style={styles.fieldLabel}>Primeira resposta</Text><Text style={styles.fieldValue}>{formatDate(detail.ticket.firstResponseDueAt)}</Text></View>
                    <View style={styles.detailField}><Text style={styles.fieldLabel}>Sincronização</Text><Text style={styles.fieldValue}>{detail.ticket.syncStatus}</Text></View>
                    <View style={styles.detailField}><Text style={styles.fieldLabel}>JSM</Text><Text style={styles.fieldValue}>{detail.ticket.jsmIssueKey ?? 'Ainda não criado'}</Text></View>
                  </View>

                  <View style={styles.section}>
                    <Text style={styles.cardTitle}>Conversa pública</Text>
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
                    {detail.messages.length === 0 ? <Text style={styles.empty}>Nenhuma mensagem pública sincronizada.</Text> : null}
                  </View>

                  {detail.events.length ? (
                    <View style={styles.section}>
                      <Text style={styles.cardTitle}>Histórico operacional</Text>
                      {detail.events.slice(-8).map((event) => (
                        <View key={event.id} style={styles.event}>
                          <Text style={styles.eventType}>{event.eventType}</Text>
                          <Text style={styles.muted}>
                            {event.actorDisplayName ?? 'Sistema'} · {formatDate(event.createdAt)}
                          </Text>
                        </View>
                      ))}
                    </View>
                  ) : null}

                  {canManage ? (
                    <View style={styles.actionsCard}>
                      <Text style={styles.cardTitle}>Ações operacionais</Text>
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

const styles = StyleSheet.create({
  content: { width: '100%', gap: 18 },
  loadingLine: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  notice: {
    padding: 13,
    borderWidth: 1,
    borderColor: '#b8d8c5',
    borderRadius: 10,
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
    padding: 16,
    borderWidth: 1,
    borderColor: '#e6c8c4',
    borderRadius: 12,
    backgroundColor: '#fff7f6',
  },
  errorText: { flex: 1, minWidth: 220, color: '#8d3831' },
  setupCard: {
    width: '100%',
    maxWidth: 680,
    gap: 12,
    padding: 22,
    borderWidth: 1,
    borderColor: '#d3ddd5',
    borderRadius: 15,
    backgroundColor: '#ffffff',
  },
  infoCard: {
    width: '100%',
    maxWidth: 680,
    gap: 8,
    padding: 22,
    borderWidth: 1,
    borderColor: '#d8dfd8',
    borderRadius: 15,
    backgroundColor: '#ffffff',
  },
  cardEyebrow: { color: '#347452', fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
  cardTitle: { color: '#17231c', fontSize: 18, fontWeight: '800' },
  muted: { color: '#667269', fontSize: 12, lineHeight: 18 },
  input: {
    minHeight: 46,
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#cbd4cc',
    borderRadius: 9,
    backgroundColor: '#fbfcfb',
    color: '#17231c',
  },
  reasonInput: { minHeight: 82, textAlignVertical: 'top' },
  primaryButton: {
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderRadius: 9,
    backgroundColor: '#173d2b',
  },
  primaryButtonText: { color: '#ffffff', fontWeight: '800' },
  secondaryButton: {
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#bdc9bf',
    borderRadius: 8,
    backgroundColor: '#ffffff',
  },
  secondaryButtonText: { color: '#274936', fontWeight: '700' },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.8 },
  operatorLine: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: 15,
    borderWidth: 1,
    borderColor: '#d8dfd8',
    borderRadius: 12,
    backgroundColor: '#f9faf8',
  },
  operatorName: { color: '#17231c', fontWeight: '800' },
  liveBadge: { color: '#347452', fontSize: 10, fontWeight: '900', letterSpacing: 1.1 },
  ownerBadge: {
    color: '#7d4d11',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.1,
  },
  runtimeCard: {
    gap: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#d8dfd8',
    borderRadius: 13,
    backgroundColor: '#ffffff',
  },
  runtimeHeader: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  runtimeToggles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  runtimeToggle: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#d3dbd4',
    borderRadius: 18,
    backgroundColor: '#f5f7f4',
  },
  runtimeToggleActive: { borderColor: '#347452', backgroundColor: '#e3f2e8' },
  runtimeToggleText: { color: '#667269', fontSize: 11, fontWeight: '800' },
  runtimeToggleTextActive: { color: '#285f43' },
  runtimeSaveRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  runtimeReason: { minWidth: 240, flex: 1 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metric: {
    minWidth: 145,
    flexGrow: 1,
    gap: 7,
    padding: 15,
    borderWidth: 1,
    borderColor: '#d8dfd8',
    borderRadius: 12,
    backgroundColor: '#ffffff',
  },
  metricLabel: { color: '#667269', fontSize: 11, fontWeight: '700' },
  metricValue: { color: '#173d2b', fontSize: 25, fontWeight: '900' },
  dangerText: { color: '#9a3f37' },
  warningText: { color: '#916421' },
  filters: {
    gap: 13,
    padding: 16,
    borderWidth: 1,
    borderColor: '#d8dfd8',
    borderRadius: 13,
    backgroundColor: '#ffffff',
  },
  filterGroup: { gap: 7 },
  filterLabel: { color: '#344239', fontSize: 12, fontWeight: '800' },
  filterOptions: { gap: 7, paddingRight: 8 },
  filterChip: {
    minHeight: 34,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#d3dbd4',
    borderRadius: 18,
    backgroundColor: '#ffffff',
  },
  filterChipSelected: { borderColor: '#27523b', backgroundColor: '#27523b' },
  filterChipText: { color: '#526158', fontSize: 11, fontWeight: '700' },
  filterChipTextSelected: { color: '#ffffff' },
  workspace: { minHeight: 560, flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  workspaceCompact: { minHeight: 0, flexDirection: 'column' },
  listPanel: {
    width: 380,
    gap: 12,
    padding: 15,
    borderWidth: 1,
    borderColor: '#d8dfd8',
    borderRadius: 14,
    backgroundColor: '#f9faf8',
  },
  detailPanel: {
    minWidth: 0,
    flex: 1,
    gap: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: '#d8dfd8',
    borderRadius: 14,
    backgroundColor: '#ffffff',
  },
  fullPanel: { width: '100%' },
  panelHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  refreshButton: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 10 },
  refreshButtonText: { color: '#285f43', fontSize: 11, fontWeight: '800' },
  ticketList: { gap: 9 },
  ticketCard: {
    minHeight: 44,
    gap: 8,
    padding: 14,
    borderWidth: 1,
    borderColor: '#d8dfd8',
    borderRadius: 11,
    backgroundColor: '#ffffff',
  },
  ticketCardSelected: { borderColor: '#347452', backgroundColor: '#f0f8f3' },
  ticketCardSlaRisk: { borderColor: '#c9892f', borderLeftWidth: 4 },
  ticketTopLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  ticketIdentity: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 },
  protocol: { color: '#347452', fontSize: 12, fontWeight: '900', letterSpacing: 0.7 },
  ticketSubject: { color: '#17231c', fontSize: 14, fontWeight: '800', lineHeight: 19 },
  ticketClient: { color: '#344239', fontSize: 12, fontWeight: '600' },
  ticketMetadata: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  metadata: { color: '#667269', fontSize: 12, fontWeight: '600' },
  slaRiskText: { color: '#8b641d', fontWeight: '800' },
  ticketDate: { color: '#7b857e', fontSize: 12 },
  checkbox: {
    width: 22,
    height: 22,
    borderWidth: 1,
    borderColor: '#bdc9bf',
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  checkboxChecked: { borderColor: '#27523b', backgroundColor: '#27523b' },
  checkboxMark: { color: '#ffffff', fontSize: 12, fontWeight: '800' },
  batchBar: {
    gap: 8,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e6d4a8',
    borderRadius: 12,
    backgroundColor: '#fffbf1',
  },
  listPanelWide: { width: 460, maxWidth: '48%' },
  desktopTable: { gap: 0, borderWidth: 1, borderColor: '#d8dfd8', borderRadius: 12, overflow: 'hidden' },
  desktopHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#f5f7f4',
    borderBottomWidth: 1,
    borderBottomColor: '#d8dfd8',
  },
  desktopRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e7ebe7',
    backgroundColor: '#ffffff',
  },
  desktopRowSelected: { backgroundColor: '#f0f8f3' },
  desktopRowSlaRisk: { borderLeftWidth: 4, borderLeftColor: '#c9892f' },
  desktopHeadCell: { color: '#7b857e', fontSize: 12, fontWeight: '800', minWidth: 72 },
  desktopFlex: { flex: 1, minWidth: 100 },
  desktopCheckCol: { width: 28, minWidth: 28 },
  priority: {
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    fontSize: 10,
    fontWeight: '900',
  },
  priority_critical: { color: '#ffffff', backgroundColor: '#9a3f37' },
  priority_high: { color: '#7d4d11', backgroundColor: '#f9e3bd' },
  priority_normal: { color: '#285f43', backgroundColor: '#dcefe3' },
  priority_low: { color: '#526158', backgroundColor: '#e9ece9' },
  empty: { paddingVertical: 18, color: '#7b857e', fontSize: 12, textAlign: 'center' },
  backButton: { minHeight: 38, justifyContent: 'center', alignSelf: 'flex-start' },
  backButtonText: { color: '#285f43', fontWeight: '800' },
  detailEmpty: { minHeight: 240, alignItems: 'center', justifyContent: 'center', gap: 7 },
  detailHeader: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 15 },
  detailTitleBlock: { minWidth: 240, flex: 1, gap: 5 },
  detailTitle: { color: '#17231c', fontSize: 23, fontWeight: '900', lineHeight: 29 },
  headerActions: { alignItems: 'flex-end', gap: 9 },
  jiraButton: {
    minHeight: 38,
    justifyContent: 'center',
    paddingHorizontal: 13,
    borderRadius: 8,
    backgroundColor: '#173d2b',
  },
  jiraButtonText: { color: '#ffffff', fontSize: 12, fontWeight: '800' },
  detailGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  detailField: {
    minWidth: 145,
    flexGrow: 1,
    gap: 4,
    padding: 12,
    borderRadius: 9,
    backgroundColor: '#f5f7f4',
  },
  fieldLabel: { color: '#78827b', fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  fieldValue: { color: '#344239', fontSize: 12, fontWeight: '700' },
  section: { gap: 10, paddingTop: 5 },
  message: {
    gap: 8,
    padding: 14,
    borderWidth: 1,
    borderColor: '#d8dfd8',
    borderRadius: 11,
    backgroundColor: '#fbfcfb',
  },
  supportMessage: { borderColor: '#b8d8c5', backgroundColor: '#f0faf4' },
  messageHeader: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 },
  messageAuthor: { color: '#344239', fontSize: 12, fontWeight: '800' },
  messageBody: { color: '#344239', lineHeight: 21 },
  event: { gap: 2, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#e7ebe7' },
  eventType: { color: '#344239', fontSize: 12, fontWeight: '800' },
  actionsCard: {
    gap: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#d8dfd8',
    borderRadius: 12,
    backgroundColor: '#f9faf8',
  },
  actionButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  escalationButton: {
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 13,
    borderWidth: 1,
    borderColor: '#d6b8b3',
    borderRadius: 8,
    backgroundColor: '#fff7f6',
  },
  escalationButtonText: { color: '#8d3831', fontWeight: '800' },
});
