import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
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
  assigneeLabel,
  categoryLabels,
  clientLabel,
  formatDateTime,
  formatRelative,
  priorityLabels,
  slaLabel,
  statusLabels,
  syncLabel,
} from '@/modules/support/support-labels';
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

function resolveTicketIdFromLocation(
  param: string | undefined,
): string | undefined {
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

type DetailTab = 'overview' | 'conversation' | 'participants' | 'technical' | 'history';

const TABS: { id: DetailTab; label: string }[] = [
  { id: 'overview', label: 'Visão geral' },
  { id: 'conversation', label: 'Conversa' },
  { id: 'participants', label: 'Envolvidos' },
  { id: 'technical', label: 'Contexto técnico' },
  { id: 'history', label: 'Histórico' },
];

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

function DefRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <View style={styles.defRow}>
      <Text style={styles.defLabel}>{label}</Text>
      <Text style={styles.defValue} selectable>{value}</Text>
    </View>
  );
}

function MessageItem({ message }: { message: SupportMessage }) {
  const kindLabel = message.authorKind === 'support'
    ? 'Resposta do suporte'
    : message.authorKind === 'system'
      ? 'Evento automático'
      : 'Mensagem pública';
  return (
    <View style={[styles.timelineItem, message.authorKind === 'support' && styles.timelineSupport]}>
      <Text style={styles.timelineWhen}>{formatDateTime(message.createdAt)}</Text>
      <Text style={styles.timelineAuthor}>
        {message.authorDisplayName} · {kindLabel}
      </Text>
      <Text style={styles.timelineBody} selectable>{message.body}</Text>
    </View>
  );
}

function EventItem({ event }: { event: SupportEvent }) {
  return (
    <View style={styles.historyRow}>
      <Text style={styles.historyWhen}>{formatDateTime(event.createdAt)}</Text>
      <Text style={styles.historyActor}>{event.actorDisplayName ?? 'Sistema'}</Text>
      <Text style={styles.historyEvent}>{event.eventType}</Text>
      <Text style={styles.historyChange} numberOfLines={2}>
        {[event.fromValue, event.toValue].filter(Boolean).join(' → ') || '—'}
      </Text>
      <Text style={styles.historyOrigin} numberOfLines={1}>{event.reason ?? '—'}</Text>
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
  const [actionsOpen, setActionsOpen] = useState(false);
  const [actionReason, setActionReason] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    setError('');
    setDetail(null);
    if (ticketIdParam === SUPPORT_TICKET_STATIC_SHELL_ID) {
      setError('Informe um chamado válido a partir da fila de atendimentos.');
      setLoading(false);
      return;
    }
    if (!isSupportTicketId(ticketIdParam)) {
      setError('O identificador do chamado na URL é inválido.');
      setLoading(false);
      return;
    }
    try {
      const result = await getControlSupportTicket(ticketIdParam);
      if (id === requestId.current) setDetail(result);
    } catch (loadError) {
      if (id === requestId.current) setError(errorMessage(loadError));
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

  const runAction = async (
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
      setActionsOpen(false);
      await load();
    } catch (actionError) {
      setNotice(errorMessage(actionError));
    } finally {
      setActionBusy(false);
    }
  };

  const ticket = detail?.ticket;
  const participants = useMemo(() => {
    if (!ticket) return [];
    const rows: { role: string; person: string; org: string; status: string }[] = [];
    rows.push({
      role: 'Solicitante',
      person: ticket.requesterDisplayName ?? 'Identidade minimizada',
      org: ticket.locationLabel ?? '—',
      status: ticket.requesterRole || '—',
    });
    rows.push({
      role: 'Responsável',
      person: assigneeLabel(ticket),
      org: ticket.teamCode ?? '—',
      status: ticket.assigneeProfileId ? 'Atribuído' : 'Sem responsável',
    });
    if (ticket.teamCode) {
      rows.push({
        role: 'Equipe',
        person: ticket.teamCode,
        org: ticket.teamId ? ticket.teamId.slice(0, 8) : '—',
        status: 'Ativa',
      });
    }
    return rows;
  }, [ticket]);

  return (
    <View style={styles.page}>
      <Pressable accessibilityRole="button" onPress={backToQueue} style={styles.back}>
        <Text style={styles.backText}>← Atendimentos</Text>
      </Pressable>

      {loading ? (
        <View style={styles.loading}>
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

      {ticket ? (
        <>
          <View style={styles.header}>
            <View style={styles.headerMain}>
              <View style={styles.protocolRow}>
                <Text style={styles.protocol}>{ticket.protocol}</Text>
                <Text style={[styles.priTag, priorityTone[ticket.priority]]}>
                  {priorityLabels[ticket.priority]}
                </Text>
              </View>
              <Text style={styles.title}>{ticket.subject}</Text>
              <Text style={styles.metaLine}>
                {statusLabels[ticket.status]}
                {' · '}
                {slaLabel(ticket)}
                {' · '}
                {assigneeLabel(ticket)}
                {' · '}
                {ticket.jsmIssueKey ?? 'Sem JSM'}
                {' · '}
                {syncLabel(ticket.syncStatus)}
              </Text>
              <Text style={styles.updated}>
                Atualizado {formatRelative(ticket.updatedAt)}
              </Text>
            </View>
            {!compact ? (
              <View style={styles.headerActions}>
                <Pressable
                  accessibilityRole="button"
                  disabled={!ticket.jsmIssueUrl}
                  onPress={() => { void openJira(); }}
                  style={[styles.primaryButton, !ticket.jsmIssueUrl && styles.disabled]}
                >
                  <Text style={styles.primaryButtonText}>
                    {ticket.jsmIssueUrl ? 'Responder' : 'Responder — indisponível'}
                  </Text>
                </Pressable>
                {!ticket.jsmIssueUrl ? (
                  <Text style={styles.hint}>Respostas públicas continuam no Jira após a sincronização.</Text>
                ) : null}
                {canManage ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setActionsOpen((current) => !current)}
                    style={styles.secondaryButton}
                  >
                    <Text style={styles.secondaryButtonText}>
                      {actionsOpen ? 'Ocultar ações' : 'Mais ações'}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </View>

          {actionsOpen && canManage ? (
            <View style={styles.actionsPanel}>
              <Text style={styles.sectionTitle}>Ações operacionais</Text>
              <Text style={styles.muted}>
                Mutações individuais autorizadas. Informe justificativa auditável.
              </Text>
              <TextInput
                editable={!actionBusy}
                maxLength={500}
                multiline
                onChangeText={setActionReason}
                placeholder="Justificativa da ação"
                style={styles.input}
                value={actionReason}
              />
              <View style={styles.actionButtons}>
                <Pressable
                  accessibilityRole="button"
                  disabled={actionBusy}
                  onPress={() => { void runAction('reprocess'); }}
                  style={[styles.secondaryButton, actionBusy && styles.disabled]}
                >
                  <Text style={styles.secondaryButtonText}>Reprocessar sync</Text>
                </Pressable>
                {([1, 2, 3] as const).map((level) => (
                  <Pressable
                    key={level}
                    accessibilityRole="button"
                    disabled={actionBusy || ticket.escalationLevel >= level}
                    onPress={() => { void runAction('escalate', level); }}
                    style={[
                      styles.escalateButton,
                      (actionBusy || ticket.escalationLevel >= level) && styles.disabled,
                    ]}
                  >
                    <Text style={styles.escalateText}>Escalar L{level}</Text>
                  </Pressable>
                ))}
                {ticket.jsmIssueUrl ? (
                  <Pressable accessibilityRole="link" onPress={() => { void openJira(); }} style={styles.secondaryButton}>
                    <Text style={styles.secondaryButtonText}>Abrir no Jira</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          ) : null}

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
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
                  <Text style={styles.sectionTitle}>Descrição</Text>
                  <Text style={styles.bodyText} selectable>{ticket.subject}</Text>
                  {ticket.impact ? (
                    <>
                      <Text style={styles.subTitle}>Impacto</Text>
                      <Text style={styles.bodyText} selectable>{ticket.impact}</Text>
                    </>
                  ) : null}

                  <Text style={styles.sectionTitle}>Dados do chamado</Text>
                  <View style={styles.defList}>
                    <DefRow label="Cliente" value={clientLabel(ticket)} />
                    <DefRow label="Área" value={categoryLabels[ticket.category]} />
                    <DefRow label="Produto" value={ticket.product} />
                    <DefRow label="Categoria" value={ticket.category} />
                    <DefRow label="Subcategoria" value={ticket.subcategory} />
                    <DefRow label="Prioridade" value={priorityLabels[ticket.priority]} />
                    <DefRow label="Status" value={statusLabels[ticket.status]} />
                    <DefRow label="SLA" value={slaLabel(ticket)} />
                    <DefRow label="Escalonamento" value={`L${ticket.escalationLevel}`} />
                    <DefRow label="Criado em" value={formatDateTime(ticket.createdAt)} />
                    <DefRow label="Atualizado em" value={formatDateTime(ticket.updatedAt)} />
                    <DefRow label="Primeira resposta até" value={formatDateTime(ticket.firstResponseDueAt)} />
                    <DefRow label="Primeira resposta em" value={formatDateTime(ticket.firstRespondedAt)} />
                    <DefRow label="Resolvido em" value={formatDateTime(ticket.resolvedAt)} />
                    <DefRow label="Fechado em" value={formatDateTime(ticket.closedAt)} />
                  </View>

                  <Text style={styles.sectionTitle}>Conta e organização</Text>
                  <View style={styles.defList}>
                    <DefRow label="Localização" value={ticket.locationLabel} />
                    <DefRow label="Estabelecimento" value={ticket.establishmentId?.slice(0, 8)} />
                    <DefRow label="Organização" value={ticket.organizationId?.slice(0, 8)} />
                    <DefRow label="Equipe" value={ticket.teamCode} />
                  </View>

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
                  <Text style={styles.sectionTitle}>Conversa pública</Text>
                  {(detail?.messages.length ?? 0) === 0 ? (
                    <Text style={styles.muted}>Nenhuma mensagem pública sincronizada nesta sessão.</Text>
                  ) : (
                    detail?.messages.map((message) => (
                      <MessageItem key={message.id} message={message} />
                    ))
                  )}
                  <View style={styles.composerDisabled}>
                    <Text style={styles.muted}>
                      Composição de resposta neste console aguarda homologação. Use Responder para abrir o Jira quando a URL estiver disponível.
                    </Text>
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
                      <Text style={[styles.headCell, styles.colOrg]}>Organização/equipe</Text>
                      <Text style={[styles.headCell, styles.colStatus]}>Situação</Text>
                    </View>
                    {participants.map((row) => (
                      <View key={`${row.role}-${row.person}`} style={styles.tableRow}>
                        <Text style={[styles.cellStrong, styles.colRole]}>{row.role}</Text>
                        <Text style={[styles.cell, styles.colPerson]}>{row.person}</Text>
                        <Text style={[styles.cell, styles.colOrg]}>{row.org}</Text>
                        <Text style={[styles.cell, styles.colStatus]}>{row.status}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              ) : null}

              {tab === 'technical' ? (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Contexto técnico</Text>
                  <Text style={styles.muted}>
                    Apenas campos expostos pela RPC atual. Plataforma, navegador e IP não são fornecidos neste contrato.
                  </Text>
                  <View style={styles.defList}>
                    <DefRow label="Sincronização" value={syncLabel(ticket.syncStatus)} />
                    <DefRow label="Erro de sync" value={ticket.lastSyncErrorCode} />
                    <DefRow label="JSM" value={ticket.jsmIssueKey} />
                    <DefRow label="URL JSM" value={ticket.jsmIssueUrl} />
                    <DefRow label="Produto" value={ticket.product} />
                    <DefRow label="Appointment" value={ticket.appointmentId} />
                    <DefRow label="Routing version" value={String(ticket.routingVersion)} />
                    <DefRow label="ID interno" value={ticket.id} />
                    <DefRow label="Requester ID" value={ticket.requesterId.slice(0, 8)} />
                  </View>
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

            {!compact ? (
              <View style={styles.sideCol}>
                <View style={styles.sideSection}>
                  <Text style={styles.sectionTitle}>Pessoas envolvidas</Text>
                  {participants.slice(0, 3).map((row) => (
                    <View key={`side-${row.role}`} style={styles.sidePerson}>
                      <Text style={styles.cellStrong}>{row.person}</Text>
                      <Text style={styles.muted}>{row.role} · {row.org}</Text>
                    </View>
                  ))}
                  <Pressable accessibilityRole="button" onPress={() => setTab('participants')}>
                    <Text style={styles.linkText}>Ver todos</Text>
                  </Pressable>
                </View>
                <View style={styles.sideSection}>
                  <Text style={styles.sectionTitle}>Conta e organização</Text>
                  <View style={styles.defList}>
                    <DefRow label="Localização" value={ticket.locationLabel ?? 'Não informado'} />
                    <DefRow label="Unidade" value={ticket.establishmentId?.slice(0, 8) ?? '—'} />
                    <DefRow label="Organização" value={ticket.organizationId?.slice(0, 8) ?? '—'} />
                  </View>
                </View>
                <View style={styles.sideSection}>
                  <Text style={styles.sectionTitle}>Dados técnicos</Text>
                  <View style={styles.defList}>
                    <DefRow label="Sync" value={syncLabel(ticket.syncStatus)} />
                    <DefRow label="JSM" value={ticket.jsmIssueKey ?? '—'} />
                    <DefRow label="Produto" value={ticket.product} />
                  </View>
                </View>
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
                  onPress={() => setActionsOpen((current) => !current)}
                  style={[styles.secondaryButton, styles.mobileActionSecondary]}
                >
                  <Text style={styles.secondaryButtonText}>Mais ações</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );
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
  headerMain: { flex: 1, minWidth: 260, gap: 6 },
  headerActions: { gap: 8, alignItems: 'flex-end', maxWidth: 320 },
  protocolRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  protocol: { color: cloudTheme.colors.textMuted, fontSize: 13, fontFamily: 'monospace', fontWeight: '700' },
  title: { color: cloudTheme.colors.text, fontSize: 24, fontWeight: '800', lineHeight: 30 },
  metaLine: { color: cloudTheme.colors.textSecondary, fontSize: 13, lineHeight: 19 },
  updated: { color: cloudTheme.colors.textMuted, fontSize: 12 },
  hint: { color: cloudTheme.colors.textMuted, fontSize: 11, textAlign: 'right' },
  priTag: {
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    fontSize: 11,
    fontWeight: '800',
  },
  actionsPanel: {
    gap: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: cloudTheme.colors.border,
  },
  actionButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  input: {
    minHeight: 80,
    borderWidth: 1,
    borderColor: cloudTheme.colors.border,
    borderRadius: 4,
    padding: 12,
    color: cloudTheme.colors.text,
    backgroundColor: cloudTheme.colors.surface,
    textAlignVertical: 'top',
  },
  escalateButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#d6b8b3',
    borderRadius: 4,
    backgroundColor: '#fff7f6',
  },
  escalateText: { color: '#8d3831', fontWeight: '800', fontSize: 12 },
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
  body: { flexDirection: 'row', alignItems: 'flex-start', gap: 32 },
  bodyCompact: { flexDirection: 'column', gap: 20 },
  mainCol: { flex: 1, minWidth: 0, gap: 16 },
  sideCol: {
    width: 340,
    flexShrink: 0,
    gap: 16,
    // @ts-expect-error sticky web
    position: 'sticky',
    top: 80,
    alignSelf: 'flex-start',
  },
  section: { gap: 10 },
  sideSection: {
    gap: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: cloudTheme.colors.border,
  },
  sectionTitle: {
    color: cloudTheme.colors.text,
    fontSize: 14,
    fontWeight: '800',
    textTransform: 'uppercase',
    marginTop: 8,
  },
  subTitle: { color: cloudTheme.colors.text, fontSize: 13, fontWeight: '700', marginTop: 8 },
  bodyText: { color: cloudTheme.colors.textSecondary, fontSize: 14, lineHeight: 21 },
  defList: { borderTopWidth: 1, borderTopColor: cloudTheme.colors.border },
  defRow: {
    flexDirection: 'row',
    gap: 12,
    minHeight: 40,
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: cloudTheme.colors.border,
  },
  defLabel: { width: 150, color: cloudTheme.colors.textMuted, fontSize: 11, fontWeight: '800' },
  defValue: { flex: 1, color: cloudTheme.colors.text, fontSize: 13, fontWeight: '600' },
  timelineItem: {
    gap: 4,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: cloudTheme.colors.border,
  },
  timelineSupport: { backgroundColor: '#f7fbf8', paddingHorizontal: 8, marginHorizontal: -8 },
  timelineWhen: { color: cloudTheme.colors.textMuted, fontSize: 11, fontWeight: '700' },
  timelineAuthor: { color: cloudTheme.colors.text, fontSize: 13, fontWeight: '700' },
  timelineBody: { color: cloudTheme.colors.textSecondary, fontSize: 14, lineHeight: 21 },
  composerDisabled: {
    marginTop: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: cloudTheme.colors.border,
    borderRadius: 4,
    backgroundColor: '#f8faf8',
  },
  table: { borderTopWidth: 1, borderTopColor: cloudTheme.colors.border },
  tableHead: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: cloudTheme.colors.border,
  },
  tableRow: {
    flexDirection: 'row',
    gap: 8,
    minHeight: 44,
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: cloudTheme.colors.border,
  },
  historyRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    minHeight: 44,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: cloudTheme.colors.border,
  },
  headCell: { color: cloudTheme.colors.textMuted, fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  cell: { color: cloudTheme.colors.textSecondary, fontSize: 13 },
  cellStrong: { color: cloudTheme.colors.text, fontSize: 13, fontWeight: '700' },
  colRole: { flex: 0.9, minWidth: 100 },
  colPerson: { flex: 1.2, minWidth: 120 },
  colOrg: { flex: 1.1, minWidth: 110 },
  colStatus: { flex: 0.9, minWidth: 90 },
  colWhen: { flex: 1.1, minWidth: 120 },
  colActor: { flex: 0.9, minWidth: 90 },
  colEvent: { flex: 1, minWidth: 100 },
  colChange: { flex: 1.2, minWidth: 120 },
  colOrigin: { flex: 1, minWidth: 100 },
  historyWhen: { flex: 1.1, minWidth: 120, color: cloudTheme.colors.textMuted, fontSize: 12 },
  historyActor: { flex: 0.9, minWidth: 90, color: cloudTheme.colors.text, fontSize: 12, fontWeight: '700' },
  historyEvent: { flex: 1, minWidth: 100, color: cloudTheme.colors.text, fontSize: 12, fontWeight: '700' },
  historyChange: { flex: 1.2, minWidth: 120, color: cloudTheme.colors.textSecondary, fontSize: 12 },
  historyOrigin: { flex: 1, minWidth: 100, color: cloudTheme.colors.textMuted, fontSize: 12 },
  sidePerson: { gap: 2, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: cloudTheme.colors.border },
  primaryButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderRadius: 4,
    backgroundColor: '#1F6B45',
  },
  primaryButtonText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  secondaryButton: {
    minHeight: 44,
    justifyContent: 'center',
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
