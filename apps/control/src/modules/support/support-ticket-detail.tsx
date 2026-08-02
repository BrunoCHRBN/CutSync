import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type TextStyle,
} from 'react-native';

import { useControlAuth } from '@/contexts/control-auth-context';
import {
  formatCompactDate,
  formatDateTime,
  formatEventTransition,
  formatRelative,
  formatTeamLabel,
  initialsFromName,
  isAutomaticEventActor,
  labelForCategory,
  labelForEventType,
  labelForImpact,
  labelForPriority,
  labelForProduct,
  labelForStatus,
  labelForSync,
  maskIdentifier,
  resolveAssigneeIdentity,
  resolveRequesterIdentity,
  resolveTeamIdentity,
  slaLabel,
} from '@/modules/support/presentation';
import {
  parseSupportQueueParams,
  SUPPORT_TICKET_STATIC_SHELL_ID,
  supportQueueHref,
} from '@/modules/support/support-queue-params';
import {
  ControlSupportError,
  escalateSupportTicket,
  getControlSupportTicket,
  isSupportTicketId,
  reprocessSupportSync,
  type SupportEscalationLevel,
  type SupportEvent,
  type SupportMessage,
  type SupportPriority,
  type SupportTicketDetail,
} from '@/services/control-support';
import { cloudTheme } from '@/theme/cloud-components';

const priorityTone: Record<SupportPriority, TextStyle> = {
  critical: { color: '#fff', backgroundColor: '#9a3f37' },
  high: { color: '#7d4d11', backgroundColor: '#f9e3bd' },
  normal: { color: '#285f43', backgroundColor: '#dcefe3' },
  low: { color: '#526158', backgroundColor: '#e9ece9' },
};

type DetailTab = 'overview' | 'conversation' | 'participants' | 'technical' | 'history';
type PendingAction =
  | { kind: 'reprocess' }
  | { kind: 'escalate'; level: Exclude<SupportEscalationLevel, 0> };

const TABS: { id: DetailTab; label: string }[] = [
  { id: 'overview', label: 'Visão geral' },
  { id: 'conversation', label: 'Conversa' },
  { id: 'participants', label: 'Envolvidos' },
  { id: 'technical', label: 'Contexto técnico' },
  { id: 'history', label: 'Histórico' },
];

function resolveTicketIdFromLocation(param: string | undefined): string | undefined {
  if (param && param !== SUPPORT_TICKET_STATIC_SHELL_ID && isSupportTicketId(param)) {
    return param;
  }
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const match = window.location.pathname.match(/\/suporte\/atendimentos\/([^/?#]+)/i);
    const fromPath = match?.[1] ? decodeURIComponent(match[1]) : undefined;
    if (fromPath && isSupportTicketId(fromPath)) return fromPath;
  }
  if (param && isSupportTicketId(param)) return param;
  return param;
}

function errorMessage(error: unknown): string {
  if (!(error instanceof ControlSupportError)) return 'Não foi possível carregar o chamado.';
  switch (error.code) {
    case 'aal2_required':
      return 'Confirme o autenticador para continuar.';
    case 'forbidden':
      return 'Seu acesso atual não permite consultar este chamado.';
    case 'not_found':
      return 'Chamado não encontrado ou indisponível para esta equipe.';
    case 'reason_required':
      return 'Informe uma justificativa válida.';
    default:
      return 'O detalhe do chamado está temporariamente indisponível.';
  }
}

function parseTab(value: string | string[] | undefined): DetailTab {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === 'conversation' || raw === 'participants' || raw === 'technical' || raw === 'history') {
    return raw;
  }
  return 'overview';
}

function DefRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
}) {
  if (!value) return null;
  return (
    <View style={styles.defRow}>
      <Text style={styles.defLabel}>{label}</Text>
      <Text style={[styles.defValue, mono && styles.mono]} selectable>{value}</Text>
    </View>
  );
}

function ContextChip({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) {
  return (
    <View style={styles.contextChip}>
      <Text style={styles.contextChipLabel}>{label}</Text>
      <Text style={[styles.contextChipValue, warn && styles.warnText]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function MessageItem({ message }: { message: SupportMessage }) {
  const kindLabel = message.authorKind === 'support'
    ? 'Resposta pública do suporte'
    : message.authorKind === 'system'
      ? 'Evento automático'
      : 'Mensagem pública';
  const initials = initialsFromName(message.authorDisplayName);
  return (
    <View style={styles.timelineItem}>
      <View style={[
        styles.avatar,
        message.authorKind === 'support' && styles.avatarSupport,
        message.authorKind === 'system' && styles.avatarSystem,
      ]}
      >
        <Text style={styles.avatarText}>{initials}</Text>
      </View>
      <View style={styles.timelineContent}>
        <Text style={styles.timelineWhen}>{formatCompactDate(message.createdAt)}</Text>
        <Text style={styles.timelineAuthor}>
          {message.authorDisplayName}
        </Text>
        <Text style={styles.timelineKind}>{kindLabel}</Text>
        <Text style={styles.timelineBody} selectable>{message.body}</Text>
      </View>
    </View>
  );
}

function EventItem({ event }: { event: SupportEvent }) {
  const transition = formatEventTransition(event.fromValue, event.toValue);
  const actor = event.actorDisplayName?.trim() || 'Sistema CutSync';
  const automatic = isAutomaticEventActor(event.actorDisplayName);
  return (
    <View style={styles.historyRow}>
      <Text style={styles.historyWhen}>{formatDateTime(event.createdAt) ?? '—'}</Text>
      <View style={styles.historyActorCol}>
        <Text style={styles.historyActor}>{actor}</Text>
        <Text style={styles.historyActorKind}>{automatic ? 'Automático' : 'Operador'}</Text>
      </View>
      <Text style={styles.historyEvent}>{labelForEventType(event.eventType)}</Text>
      <Text style={styles.historyChange} numberOfLines={2}>{transition ?? '—'}</Text>
      <Text style={styles.historyOrigin} numberOfLines={2}>{event.reason ?? '—'}</Text>
    </View>
  );
}

export function SupportTicketDetailScreen() {
  const router = useRouter();
  const rawParams = useLocalSearchParams();
  const rawTicketId = Array.isArray(rawParams.ticketId) ? rawParams.ticketId[0] : rawParams.ticketId;
  const ticketIdParam = resolveTicketIdFromLocation(rawTicketId);
  const tab = parseTab(rawParams.tab);
  const queue = useMemo(() => parseSupportQueueParams(rawParams), [rawParams]);
  const { width } = useWindowDimensions();
  const compact = width < 960;
  const { can } = useControlAuth();
  const canManage = can('control.support.manage');

  const [detail, setDetail] = useState<SupportTicketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [actionReason, setActionReason] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    setError('');
    if (ticketIdParam === SUPPORT_TICKET_STATIC_SHELL_ID) {
      setDetail(null);
      setError('Informe um chamado válido a partir da fila de atendimentos.');
      setLoading(false);
      return;
    }
    if (!isSupportTicketId(ticketIdParam)) {
      setDetail(null);
      setError('O identificador do chamado na URL é inválido.');
      setLoading(false);
      return;
    }
    try {
      const result = await getControlSupportTicket(ticketIdParam);
      if (id === requestId.current) setDetail(result);
    } catch (loadError) {
      if (id === requestId.current) {
        setDetail(null);
        setError(errorMessage(loadError));
      }
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [ticketIdParam]);

  useFocusEffect(useCallback(() => {
    if (can('control.support.read')) void load();
    return () => { requestId.current += 1; };
  }, [can, load]));

  const backToQueue = () => {
    router.push(supportQueueHref(queue) as never);
  };

  const setTab = (next: DetailTab) => {
    router.setParams({ tab: next === 'overview' ? undefined : next } as never);
  };

  const openJira = async () => {
    if (!detail?.ticket.jsmIssueUrl) {
      setNotice('Este chamado ainda não possui URL pública do Jira.');
      return;
    }
    try {
      await Linking.openURL(detail.ticket.jsmIssueUrl);
    } catch {
      setNotice('Não foi possível abrir o chamado no Jira.');
    }
  };

  const confirmAction = async () => {
    if (!canManage || !detail || !pendingAction || actionReason.trim().length < 10) {
      setNotice('Informe uma justificativa com pelo menos 10 caracteres.');
      return;
    }
    setActionBusy(true);
    setNotice('');
    try {
      if (pendingAction.kind === 'reprocess') {
        await reprocessSupportSync(detail.ticket.id, actionReason);
        setNotice('Sincronização recolocada na fila.');
      } else {
        await escalateSupportTicket(detail.ticket.id, pendingAction.level, actionReason);
        setNotice(`Chamado escalado para L${pendingAction.level}.`);
      }
      setActionReason('');
      setPendingAction(null);
      setMenuOpen(false);
      await load();
    } catch (actionError) {
      setNotice(errorMessage(actionError));
    } finally {
      setActionBusy(false);
    }
  };

  const ticket = detail?.ticket;
  const requester = ticket ? resolveRequesterIdentity(ticket) : null;
  const assignee = ticket ? resolveAssigneeIdentity(ticket) : null;
  const team = ticket ? resolveTeamIdentity({ teamCode: ticket.teamCode, teamId: ticket.teamId }) : null;
  const slaOut = ticket ? slaLabel(ticket) === 'Fora do SLA' : false;

  const participants = useMemo(() => {
    if (!ticket || !requester || !assignee || !team) return [];
    return [
      {
        role: 'Solicitante',
        person: requester.primary,
        org: ticket.locationLabel ?? '—',
        status: ticket.requesterRole ? labelForTransitionSafe(ticket.requesterRole) : 'Ativo',
        contact: null as string | null,
      },
      {
        role: 'Responsável',
        person: assignee.primary,
        org: team.primary,
        status: ticket.assigneeProfileId ? 'Atribuído' : 'Sem responsável',
        contact: assignee.secondary,
      },
      {
        role: 'Equipe responsável',
        person: team.primary,
        org: formatTeamLabel(ticket.teamCode) ?? '—',
        status: ticket.teamCode ? 'Ativa' : 'Não informada',
        contact: team.secondary,
      },
    ];
  }, [ticket, requester, assignee, team]);

  const showSidePanel = !compact && (tab === 'overview' || tab === 'conversation' || tab === 'history');
  const sideCompact = tab === 'conversation' || tab === 'history';

  const actionTitle = pendingAction?.kind === 'reprocess'
    ? 'Reprocessar sincronização'
    : pendingAction?.kind === 'escalate'
      ? `Escalar para L${pendingAction.level}`
      : '';

  return (
    <View style={styles.page}>
      <Pressable accessibilityRole="button" onPress={backToQueue} style={styles.back}>
        <Text style={styles.backText}>← Atendimentos</Text>
      </Pressable>

      {loading && !detail ? (
        <View style={styles.loading} accessibilityLiveRegion="polite">
          <ActivityIndicator color={cloudTheme.colors.brand} />
          <Text style={styles.muted}>Carregando chamado…</Text>
        </View>
      ) : null}

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorTitle}>Não foi possível abrir o chamado</Text>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable accessibilityRole="button" onPress={backToQueue} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Voltar para atendimentos</Text>
          </Pressable>
        </View>
      ) : null}

      {notice ? <Text accessibilityRole="alert" style={styles.notice}>{notice}</Text> : null}

      {ticket && requester && assignee && team ? (
        <>
          <View style={styles.header}>
            <View style={styles.headerMain}>
              <View style={styles.protocolRow}>
                <Text style={styles.protocol}>{ticket.protocol}</Text>
                <Text style={[styles.priTag, priorityTone[ticket.priority]]}>
                  {labelForPriority(ticket.priority)}
                </Text>
              </View>
              <Text style={styles.title}>{ticket.subject}</Text>
              <View style={styles.contextStrip}>
                <ContextChip label="Status" value={labelForStatus(ticket.status)} />
                <ContextChip label="SLA" value={slaLabel(ticket)} warn={slaOut} />
                <ContextChip label="Responsável" value={assignee.primary} />
                <ContextChip label="Equipe" value={team.primary} />
                <ContextChip label="JSM" value={ticket.jsmIssueKey ?? 'Sem referência'} />
                <ContextChip label="Sincronização" value={labelForSync(ticket.syncStatus)} />
                <ContextChip label="Atualizado" value={formatRelative(ticket.updatedAt)} />
              </View>
            </View>
            {!compact ? (
              <View style={styles.headerActions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={ticket.jsmIssueUrl ? 'Responder no Jira' : 'Responder indisponível'}
                  disabled={!ticket.jsmIssueUrl}
                  onPress={() => { void openJira(); }}
                  style={[styles.primaryButton, !ticket.jsmIssueUrl && styles.disabled]}
                >
                  <Text style={styles.primaryButtonText}>Responder</Text>
                </Pressable>
                {canManage ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ expanded: menuOpen }}
                    onPress={() => setMenuOpen((current) => !current)}
                    style={styles.secondaryButton}
                  >
                    <Text style={styles.secondaryButtonText}>Mais ações</Text>
                  </Pressable>
                ) : null}
                {!ticket.jsmIssueUrl ? (
                  <Text style={styles.hint}>
                    Respostas pelo CutSync Cloud estão em homologação. Use Abrir no Jira quando a URL existir.
                  </Text>
                ) : null}
              </View>
            ) : null}
          </View>

          {menuOpen && canManage && !pendingAction ? (
            <View style={styles.menuPanel} accessibilityRole="menu">
              <Pressable
                accessibilityRole="menuitem"
                onPress={() => setPendingAction({ kind: 'reprocess' })}
                style={styles.menuItem}
              >
                <Text style={styles.menuItemText}>Reprocessar sincronização</Text>
              </Pressable>
              {([1, 2, 3] as const).map((level) => (
                <Pressable
                  key={level}
                  accessibilityRole="menuitem"
                  disabled={ticket.escalationLevel >= level}
                  onPress={() => setPendingAction({ kind: 'escalate', level })}
                  style={[styles.menuItem, ticket.escalationLevel >= level && styles.disabled]}
                >
                  <Text style={styles.menuItemText}>Escalar para L{level}</Text>
                </Pressable>
              ))}
              {ticket.jsmIssueUrl ? (
                <Pressable
                  accessibilityRole="menuitem"
                  onPress={() => { void openJira(); setMenuOpen(false); }}
                  style={styles.menuItem}
                >
                  <Text style={styles.menuItemText}>Abrir no Jira</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabs}
            accessibilityRole="tablist"
          >
            {TABS.map((item) => (
              <Pressable
                key={item.id}
                accessibilityRole="tab"
                accessibilityState={{ selected: tab === item.id }}
                onPress={() => setTab(item.id)}
                style={[styles.tab, tab === item.id && styles.tabActive]}
              >
                <Text style={[styles.tabText, tab === item.id && styles.tabTextActive]}>
                  {item.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          <View style={[styles.body, compact && styles.bodyCompact]}>
            <View style={styles.mainCol}>
              {tab === 'overview' ? (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Resumo</Text>
                  <Text style={styles.bodyText} selectable>{ticket.subject}</Text>
                  {ticket.impact ? (
                    <DefRow label="Impacto" value={labelForImpact(ticket.impact)} />
                  ) : null}

                  <Text style={styles.sectionTitle}>Dados do chamado</Text>
                  <View style={styles.defList}>
                    <DefRow label="Protocolo" value={ticket.protocol} mono />
                    <DefRow label="Cliente" value={requester.primary} />
                    <DefRow label="Área" value={labelForCategory(ticket.category)} />
                    <DefRow label="Produto" value={labelForProduct(ticket.product)} />
                    <DefRow label="Categoria" value={labelForCategory(ticket.category)} />
                    <DefRow label="Subcategoria" value={ticket.subcategory} />
                    <DefRow label="Prioridade" value={labelForPriority(ticket.priority)} />
                    <DefRow label="Status" value={labelForStatus(ticket.status)} />
                    <DefRow label="SLA" value={slaLabel(ticket)} />
                    <DefRow label="Escalonamento" value={`L${ticket.escalationLevel}`} />
                  </View>

                  <Text style={styles.sectionTitle}>Prazos</Text>
                  <View style={styles.defList}>
                    <DefRow label="Criado em" value={formatDateTime(ticket.createdAt)} />
                    <DefRow label="Atualizado em" value={formatDateTime(ticket.updatedAt)} />
                    <DefRow label="Primeira resposta até" value={formatDateTime(ticket.firstResponseDueAt)} />
                    <DefRow label="Primeira resposta em" value={formatDateTime(ticket.firstRespondedAt)} />
                    {ticket.resolvedAt || ticket.closedAt ? (
                      <>
                        <DefRow label="Resolvido em" value={formatDateTime(ticket.resolvedAt)} />
                        <DefRow label="Fechado em" value={formatDateTime(ticket.closedAt)} />
                      </>
                    ) : (
                      <Text style={styles.muted}>Informações de resolução ainda não disponíveis.</Text>
                    )}
                  </View>

                  {(ticket.locationLabel || ticket.establishmentId || ticket.organizationId) ? (
                    <>
                      <Text style={styles.sectionTitle}>Conta e organização</Text>
                      <View style={styles.defList}>
                        <DefRow label="Localização" value={ticket.locationLabel} />
                        <DefRow label="Estabelecimento" value={maskIdentifier(ticket.establishmentId)} mono />
                        <DefRow label="Organização" value={maskIdentifier(ticket.organizationId)} mono />
                        <DefRow label="Equipe" value={team.primary} />
                      </View>
                    </>
                  ) : null}

                  {(detail?.messages.length ?? 0) > 0 ? (
                    <>
                      <Text style={styles.sectionTitle}>Resumo da conversa</Text>
                      {detail?.messages.slice(0, 3).map((message) => (
                        <MessageItem key={`overview-${message.id}`} message={message} />
                      ))}
                      <Pressable accessibilityRole="button" onPress={() => setTab('conversation')}>
                        <Text style={styles.linkText}>Ver conversa completa</Text>
                      </Pressable>
                    </>
                  ) : null}
                </View>
              ) : null}

              {tab === 'conversation' ? (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Conversa</Text>
                  {(detail?.messages.length ?? 0) === 0 ? (
                    <Text style={styles.muted}>Nenhuma mensagem pública sincronizada nesta sessão.</Text>
                  ) : (
                    detail?.messages.map((message) => (
                      <MessageItem key={message.id} message={message} />
                    ))
                  )}
                  <View style={styles.composerDisabled}>
                    <Text style={styles.muted}>
                      Respostas pelo CutSync Cloud estão em homologação.
                    </Text>
                    {ticket.jsmIssueUrl ? (
                      <Pressable accessibilityRole="button" onPress={() => { void openJira(); }} style={styles.secondaryButton}>
                        <Text style={styles.secondaryButtonText}>Abrir no Jira</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              ) : null}

              {tab === 'participants' ? (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Pessoas envolvidas</Text>
                  <Text style={styles.muted}>
                    Derivado das fontes atuais do chamado. Não há catálogo formal de colaboradores nesta RPC.
                  </Text>
                  <View style={styles.table}>
                    <View style={styles.tableHead}>
                      <Text style={[styles.headCell, styles.colRole]}>Papel</Text>
                      <Text style={[styles.headCell, styles.colPerson]}>Pessoa</Text>
                      <Text style={[styles.headCell, styles.colOrg]}>Equipe/organização</Text>
                      <Text style={[styles.headCell, styles.colStatus]}>Situação</Text>
                    </View>
                    {participants.map((row) => (
                      <View key={`${row.role}-${row.person}`} style={styles.tableRow}>
                        <Text style={[styles.cellStrong, styles.colRole]}>{row.role}</Text>
                        <View style={styles.colPerson}>
                          <Text style={styles.cellStrong}>{row.person}</Text>
                          {row.contact ? <Text style={styles.metaSecondary}>{row.contact}</Text> : null}
                        </View>
                        <Text style={[styles.cell, styles.colOrg]}>{row.org}</Text>
                        <Text style={[styles.cell, styles.colStatus]}>{row.status}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              ) : null}

              {tab === 'technical' ? (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Integração</Text>
                  <View style={styles.defList}>
                    <DefRow label="JSM" value={ticket.jsmIssueKey} mono />
                    <DefRow label="URL JSM" value={ticket.jsmIssueUrl} />
                    <DefRow label="Sincronização" value={labelForSync(ticket.syncStatus)} />
                    <DefRow label="Erro de sync" value={ticket.lastSyncErrorCode} mono />
                  </View>
                  <Text style={styles.sectionTitle}>Identificadores</Text>
                  <View style={styles.defList}>
                    <DefRow label="ID interno" value={ticket.id} mono />
                    <DefRow label="Solicitante" value={maskIdentifier(ticket.requesterId)} mono />
                    <DefRow label="Responsável" value={maskIdentifier(ticket.assigneeProfileId)} mono />
                    <DefRow label="Estabelecimento" value={maskIdentifier(ticket.establishmentId)} mono />
                    <DefRow label="Organização" value={maskIdentifier(ticket.organizationId)} mono />
                    <DefRow label="Appointment" value={maskIdentifier(ticket.appointmentId)} mono />
                  </View>
                  <Text style={styles.sectionTitle}>Processamento</Text>
                  <View style={styles.defList}>
                    <DefRow label="Produto" value={labelForProduct(ticket.product)} />
                    <DefRow label="Versão de roteamento" value={String(ticket.routingVersion)} />
                  </View>
                  <Text style={styles.muted}>
                    Plataforma, navegador e IP não são fornecidos pelo contrato atual.
                  </Text>
                </View>
              ) : null}

              {tab === 'history' ? (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Histórico</Text>
                  {(detail?.events.length ?? 0) === 0 ? (
                    <Text style={styles.muted}>Sem eventos operacionais nesta sessão.</Text>
                  ) : (
                    <View style={styles.table}>
                      <View style={styles.tableHead}>
                        <Text style={[styles.headCell, styles.colWhen]}>Data e hora</Text>
                        <Text style={[styles.headCell, styles.colActor]}>Ator</Text>
                        <Text style={[styles.headCell, styles.colEvent]}>Evento</Text>
                        <Text style={[styles.headCell, styles.colChange]}>Antes → Depois</Text>
                        <Text style={[styles.headCell, styles.colOrigin]}>Origem</Text>
                      </View>
                      {detail?.events.map((event) => (
                        <EventItem key={event.id} event={event} />
                      ))}
                    </View>
                  )}
                </View>
              ) : null}
            </View>

            {showSidePanel ? (
              <View style={[styles.sideCol, sideCompact && styles.sideColCompact]}>
                {tab === 'overview' || tab === 'conversation' ? (
                  <View style={styles.sideSection}>
                    <Text style={styles.sectionTitle}>Pessoas envolvidas</Text>
                    {participants.slice(0, sideCompact ? 2 : 3).map((row) => (
                      <View key={`side-${row.role}`} style={styles.sidePerson}>
                        <Text style={styles.cellStrong}>{row.person}</Text>
                        <Text style={styles.muted}>{row.role} · {row.org}</Text>
                      </View>
                    ))}
                    {tab === 'overview' ? (
                      <Pressable accessibilityRole="button" onPress={() => setTab('participants')}>
                        <Text style={styles.linkText}>Ver todos</Text>
                      </Pressable>
                    ) : null}
                  </View>
                ) : null}
                {tab === 'overview' ? (
                  <>
                    <View style={styles.sideSection}>
                      <Text style={styles.sectionTitle}>Conta e organização</Text>
                      <View style={styles.defList}>
                        <DefRow label="Localização" value={ticket.locationLabel} />
                        <DefRow label="Unidade" value={maskIdentifier(ticket.establishmentId)} mono />
                        <DefRow label="Organização" value={maskIdentifier(ticket.organizationId)} mono />
                      </View>
                    </View>
                    <View style={styles.sideSection}>
                      <Text style={styles.sectionTitle}>Dados técnicos</Text>
                      <View style={styles.defList}>
                        <DefRow label="Sync" value={labelForSync(ticket.syncStatus)} />
                        <DefRow label="JSM" value={ticket.jsmIssueKey} mono />
                        <DefRow label="Produto" value={labelForProduct(ticket.product)} />
                      </View>
                    </View>
                  </>
                ) : null}
                {tab === 'history' ? (
                  <View style={styles.sideSection}>
                    <Text style={styles.sectionTitle}>Referência</Text>
                    <View style={styles.defList}>
                      <DefRow label="Protocolo" value={ticket.protocol} mono />
                      <DefRow label="JSM" value={ticket.jsmIssueKey} mono />
                      <DefRow label="Status" value={labelForStatus(ticket.status)} />
                    </View>
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>

          {compact ? (
            <View style={styles.mobileActions}>
              <Pressable
                accessibilityRole="button"
                disabled={!ticket.jsmIssueUrl}
                onPress={() => { void openJira(); }}
                style={[styles.primaryButton, styles.mobileActionPrimary, !ticket.jsmIssueUrl && styles.disabled]}
              >
                <Text style={styles.primaryButtonText}>Responder</Text>
              </Pressable>
              {canManage ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setMenuOpen((current) => !current)}
                  style={[styles.secondaryButton, styles.mobileActionSecondary]}
                >
                  <Text style={styles.secondaryButtonText}>Mais ações</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </>
      ) : null}

      <Modal
        animationType="fade"
        transparent
        visible={Boolean(pendingAction)}
        onRequestClose={() => {
          if (!actionBusy) {
            setPendingAction(null);
            setActionReason('');
          }
        }}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard} accessibilityViewIsModal>
            <Text style={styles.sectionTitle}>{actionTitle}</Text>
            <Text style={styles.muted}>
              Justificativa obrigatória para auditoria. Mínimo de 10 caracteres.
            </Text>
            <TextInput
              accessibilityLabel="Justificativa da ação"
              editable={!actionBusy}
              maxLength={500}
              multiline
              onChangeText={setActionReason}
              placeholder="Descreva o motivo da ação"
              style={styles.input}
              value={actionReason}
            />
            <View style={styles.modalActions}>
              <Pressable
                accessibilityRole="button"
                disabled={actionBusy}
                onPress={() => {
                  setPendingAction(null);
                  setActionReason('');
                }}
                style={[styles.secondaryButton, actionBusy && styles.disabled]}
              >
                <Text style={styles.secondaryButtonText}>Cancelar</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={actionBusy}
                onPress={() => { void confirmAction(); }}
                style={[styles.primaryButton, actionBusy && styles.disabled]}
              >
                <Text style={styles.primaryButtonText}>
                  {actionBusy ? 'Executando…' : 'Confirmar'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function labelForTransitionSafe(value: string): string {
  return value.replace(/[_-]+/g, ' ');
}

const styles = StyleSheet.create({
  page: {
    width: '100%',
    maxWidth: 1360,
    alignSelf: 'center',
    gap: 16,
    paddingHorizontal: 32,
    paddingVertical: cloudTheme.layout.contentPadding,
  },
  back: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
  backText: { color: '#1F6B45', fontWeight: '800', fontSize: 13 },
  loading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  muted: { color: cloudTheme.colors.textSecondary, fontSize: 13, lineHeight: 19 },
  notice: {
    padding: 12,
    borderWidth: 1,
    borderColor: '#b8d8c5',
    borderRadius: 4,
    backgroundColor: '#f0faf4',
    color: '#285f43',
    fontWeight: '600',
  },
  errorBox: {
    gap: 10,
    padding: 16,
    borderWidth: 1,
    borderColor: cloudTheme.colors.danger,
    borderRadius: 4,
    backgroundColor: cloudTheme.colors.dangerSoft,
  },
  errorTitle: { color: cloudTheme.colors.danger, fontWeight: '800', fontSize: 15 },
  errorText: { color: cloudTheme.colors.danger, fontSize: 13 },
  header: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: cloudTheme.colors.border,
  },
  headerMain: { flex: 1, minWidth: 260, gap: 8 },
  headerActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'flex-start',
    maxWidth: 360,
    justifyContent: 'flex-end',
  },
  protocolRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  protocol: {
    color: cloudTheme.colors.textMuted,
    fontSize: 13,
    fontFamily: Platform.select({ web: 'ui-monospace, SFMono-Regular, Menlo, monospace', default: 'monospace' }),
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  title: { color: cloudTheme.colors.text, fontSize: 24, fontWeight: '800', lineHeight: 30 },
  contextStrip: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  contextChip: {
    minWidth: 110,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: cloudTheme.colors.border,
    borderRadius: 4,
    backgroundColor: '#f7f9f7',
    gap: 2,
  },
  contextChipLabel: { color: cloudTheme.colors.textMuted, fontSize: 10, fontWeight: '800' },
  contextChipValue: { color: cloudTheme.colors.text, fontSize: 12, fontWeight: '700' },
  warnText: { color: '#8b641d' },
  hint: { color: cloudTheme.colors.textMuted, fontSize: 11, textAlign: 'right', maxWidth: 280 },
  priTag: {
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    fontSize: 11,
    fontWeight: '800',
  },
  menuPanel: {
    borderWidth: 1,
    borderColor: cloudTheme.colors.border,
    borderRadius: 4,
    backgroundColor: cloudTheme.colors.surface,
    overflow: 'hidden',
    alignSelf: 'flex-end',
    minWidth: 260,
  },
  menuItem: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#eef1ee',
  },
  menuItemText: { color: cloudTheme.colors.text, fontSize: 13, fontWeight: '700' },
  tabs: { flexDirection: 'row', gap: 4, paddingBottom: 4 },
  tab: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: '#1F6B45' },
  tabText: { color: cloudTheme.colors.textMuted, fontSize: 13, fontWeight: '700' },
  tabTextActive: { color: '#1F6B45', fontWeight: '800' },
  body: { flexDirection: 'row', gap: 28, alignItems: 'flex-start' },
  bodyCompact: { flexDirection: 'column' },
  mainCol: { flex: 1, minWidth: 0, gap: 8 },
  sideCol: {
    width: 340,
    gap: 4,
    borderLeftWidth: 1,
    borderLeftColor: cloudTheme.colors.border,
    paddingLeft: 20,
  },
  sideColCompact: { width: 280 },
  sideSection: {
    gap: 8,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: cloudTheme.colors.border,
  },
  sidePerson: { gap: 2, paddingVertical: 4 },
  section: { gap: 10 },
  sectionTitle: {
    color: cloudTheme.colors.text,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginTop: 8,
  },
  bodyText: { color: cloudTheme.colors.text, fontSize: 14, lineHeight: 21 },
  defList: { gap: 0 },
  defRow: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eef1ee',
  },
  defLabel: { width: 160, color: cloudTheme.colors.textMuted, fontSize: 12, fontWeight: '700' },
  defValue: { flex: 1, color: cloudTheme.colors.text, fontSize: 13, fontWeight: '600' },
  mono: {
    fontFamily: Platform.select({ web: 'ui-monospace, SFMono-Regular, Menlo, monospace', default: 'monospace' }),
    fontVariant: ['tabular-nums'],
  },
  metaSecondary: { color: cloudTheme.colors.textMuted, fontSize: 11 },
  timelineItem: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eef1ee',
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#dcefe3',
  },
  avatarSupport: { backgroundColor: '#e4e8f5' },
  avatarSystem: { backgroundColor: '#ececec' },
  avatarText: { color: '#274936', fontSize: 11, fontWeight: '800' },
  timelineContent: { flex: 1, gap: 2, minWidth: 0 },
  timelineWhen: { color: cloudTheme.colors.textMuted, fontSize: 12, fontVariant: ['tabular-nums'] },
  timelineAuthor: { color: cloudTheme.colors.text, fontSize: 13, fontWeight: '800' },
  timelineKind: { color: cloudTheme.colors.textSecondary, fontSize: 12 },
  timelineBody: { color: cloudTheme.colors.text, fontSize: 13, lineHeight: 20, marginTop: 4 },
  composerDisabled: {
    gap: 10,
    marginTop: 8,
    padding: 14,
    borderWidth: 1,
    borderColor: cloudTheme.colors.border,
    borderRadius: 4,
    backgroundColor: '#f7f9f7',
  },
  table: { width: '100%', borderTopWidth: 1, borderTopColor: cloudTheme.colors.border },
  tableHead: {
    flexDirection: 'row',
    gap: 8,
    minHeight: 40,
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: cloudTheme.colors.border,
    backgroundColor: '#f5f7f4',
  },
  tableRow: {
    flexDirection: 'row',
    gap: 8,
    minHeight: 52,
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: cloudTheme.colors.border,
  },
  headCell: { color: cloudTheme.colors.textMuted, fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  cell: { color: cloudTheme.colors.textSecondary, fontSize: 13 },
  cellStrong: { color: cloudTheme.colors.text, fontSize: 13, fontWeight: '700' },
  colRole: { width: 120 },
  colPerson: { flex: 1.2, minWidth: 120 },
  colOrg: { flex: 1, minWidth: 100 },
  colStatus: { width: 110 },
  historyRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: cloudTheme.colors.border,
  },
  historyWhen: { width: 140, color: cloudTheme.colors.textMuted, fontSize: 12, fontVariant: ['tabular-nums'] },
  historyActorCol: { width: 130, gap: 2 },
  historyActor: { color: cloudTheme.colors.text, fontSize: 12, fontWeight: '700' },
  historyActorKind: { color: cloudTheme.colors.textMuted, fontSize: 11 },
  historyEvent: { flex: 1.2, minWidth: 120, color: cloudTheme.colors.text, fontSize: 13, fontWeight: '700' },
  historyChange: { flex: 1, minWidth: 100, color: cloudTheme.colors.textSecondary, fontSize: 12 },
  historyOrigin: { width: 120, color: cloudTheme.colors.textMuted, fontSize: 12 },
  colWhen: { width: 140 },
  colActor: { width: 130 },
  colEvent: { flex: 1.2, minWidth: 120 },
  colChange: { flex: 1, minWidth: 100 },
  colOrigin: { width: 120 },
  mobileActions: {
    flexDirection: 'row',
    gap: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: cloudTheme.colors.border,
    backgroundColor: cloudTheme.colors.surface,
    // @ts-expect-error RN web sticky
    position: Platform.OS === 'web' ? 'sticky' : 'relative',
    bottom: 0,
    zIndex: 5,
  },
  mobileActionPrimary: { flex: 1 },
  mobileActionSecondary: { flex: 1 },
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
  input: {
    minHeight: 88,
    borderWidth: 1,
    borderColor: cloudTheme.colors.border,
    borderRadius: 4,
    padding: 12,
    color: cloudTheme.colors.text,
    backgroundColor: cloudTheme.colors.surface,
    textAlignVertical: 'top',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(20, 32, 24, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 480,
    gap: 12,
    padding: 20,
    borderRadius: 6,
    backgroundColor: cloudTheme.colors.surface,
    borderWidth: 1,
    borderColor: cloudTheme.colors.border,
  },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
});
