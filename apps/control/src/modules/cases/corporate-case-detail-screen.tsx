import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

import { FeedbackState } from '@/components/cloud/feedback-state';
import { FilterTabs, type FilterTab } from '@/components/cloud/filter-tabs';
import { StatusBadge } from '@/components/cloud/status-badge';
import { ControlNotice } from '@/components/control-ui';
import { SectionPage } from '@/components/section-page';
import { CorporateCaseActionPanel } from '@/modules/cases/corporate-case-action-panel';
import { CorporateCaseApprovalPanel } from '@/modules/cases/corporate-case-approval-panel';
import { CorporateCaseFulfillmentPanel } from '@/modules/cases/corporate-case-fulfillment-panel';
import {
  corporateCasePriorityLabels,
  corporateCasePriorityTone,
  corporateCaseRiskLabels,
  corporateCaseStatusTone,
  formatCorporateCaseDate,
  formatCorporateCaseDeadline,
  formatCorporateCaseStatus,
  isCorporateCaseUuid,
} from '@/modules/cases/corporate-cases-presentation';
import {
  getCorporateCaseDetail,
  getCorporateCasesReadContext,
  type CorporateCaseDetail,
} from '@/services/corporate-cases';
import { cloudTheme } from '@/theme/cloud-components';

export const CORPORATE_CASE_STATIC_SHELL_ID = '00000000-0000-4000-8000-000000000000';

type DetailTab = 'overview' | 'workflow' | 'messages' | 'participants' | 'history';

const detailTabs: FilterTab<DetailTab>[] = [
  { id: 'overview', label: 'Visão geral' },
  { id: 'workflow', label: 'Fluxo e aprovações' },
  { id: 'messages', label: 'Atualizações' },
  { id: 'participants', label: 'Participantes' },
  { id: 'history', label: 'Histórico' },
];

const participantRoleLabels = {
  requester: 'Solicitante',
  beneficiary: 'Beneficiário',
  observer: 'Observador',
  triager: 'Triagem',
  assignee: 'Responsável',
  approver: 'Aprovador',
  auditor: 'Auditor',
} as const;

const taskTypeLabels = {
  triage: 'Triagem',
  review: 'Validação',
  approval: 'Aprovação',
  fulfillment: 'Execução',
} as const;

const taskStatusLabels = {
  pending: 'Pendente',
  in_progress: 'Em andamento',
  waiting: 'Aguardando',
  completed: 'Concluída',
  cancelled: 'Cancelada',
  expired: 'Expirada',
} as const;

const approvalDecisionLabels = {
  pending: 'Pendente',
  approved: 'Aprovada',
  rejected: 'Rejeitada',
  cancelled: 'Cancelada',
  expired: 'Expirada',
} as const;

function resolveCaseId(param: string | undefined): string | undefined {
  if (param && param !== CORPORATE_CASE_STATIC_SHELL_ID && isCorporateCaseUuid(param)) return param;
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const match = window.location.pathname.match(/\/chamados\/([^/?#]+)/i);
    const fromPath = match?.[1] ? decodeURIComponent(match[1]) : undefined;
    if (fromPath && fromPath !== CORPORATE_CASE_STATIC_SHELL_ID && isCorporateCaseUuid(fromPath)) {
      return fromPath;
    }
  }
  return param;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Não foi possível carregar o chamado.';
}

function Definition({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <View style={styles.definition}>
      <Text style={styles.definitionLabel}>{label}</Text>
      <Text style={styles.definitionValue} selectable>{value}</Text>
    </View>
  );
}

function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeading}>
        <Text style={styles.cardTitle}>{title}</Text>
        {description ? <Text style={styles.cardDescription}>{description}</Text> : null}
      </View>
      {children}
    </View>
  );
}

function Overview({ detail }: { detail: CorporateCaseDetail }) {
  const record = detail.case;
  const deadline = formatCorporateCaseDeadline(record.expiresAt);
  const accessAction = record.caseTypeKey === 'access_release'
    && (record.formPayload.requested_action === 'grant' || record.formPayload.requested_action === 'revoke')
    ? record.formPayload.requested_action
    : null;
  const requestedProfileKey = record.caseTypeKey === 'access_release'
    && typeof record.formPayload.requested_profile_key === 'string'
    ? record.formPayload.requested_profile_key
    : null;
  const requestedValidUntil = record.caseTypeKey === 'access_release'
    && typeof record.formPayload.requested_valid_until === 'string'
    ? record.formPayload.requested_valid_until
    : null;
  return (
    <View style={styles.stack}>
      <SectionCard title="Resumo da solicitação">
        <Text style={styles.summary}>{record.summary}</Text>
        <View style={styles.definitionGrid}>
          <Definition label="Tipo" value={record.caseTypeLabel} />
          <Definition label="Área" value={record.area} />
          <Definition label="Categoria" value={record.category} />
          <Definition label="Solicitante" value={record.requesterName} />
          <Definition label="Beneficiário" value={record.beneficiaryName} />
          <Definition label="Ação solicitada" value={accessAction === 'grant' ? 'Concessão' : accessAction === 'revoke' ? 'Revogação' : null} />
          <Definition label="Pacote solicitado" value={requestedProfileKey} />
          <Definition label="Validade solicitada" value={requestedValidUntil ? formatCorporateCaseDate(requestedValidUntil) : null} />
          <Definition label="Grupo atual" value={record.currentGroupLabel} />
          <Definition label="Responsável" value={record.currentAssigneeName} />
          <Definition label="Criado em" value={formatCorporateCaseDate(record.createdAt)} />
          <Definition label="Atualizado em" value={formatCorporateCaseDate(record.updatedAt)} />
        </View>
      </SectionCard>
      <SectionCard
        title="Prazo e visibilidade"
        description="O backend filtra mensagens, eventos e justificativas antes de entregar este detalhe."
      >
        <View style={styles.badges}>
          <StatusBadge label={deadline.label} tone={deadline.tone} />
          <StatusBadge label={`Risco ${corporateCaseRiskLabels[record.riskLevel]}`} tone={record.riskLevel === 'critical' ? 'danger' : record.riskLevel === 'high' ? 'warning' : 'neutral'} />
          <StatusBadge label={record.sensitivity === 'internal' ? 'Interno' : record.sensitivity === 'restricted' ? 'Restrito' : 'Confidencial'} tone={record.sensitivity === 'internal' ? 'neutral' : 'warning'} />
        </View>
        <Text style={styles.note}>
          A interface exibe somente campos estruturados reconhecidos; o payload bruto permanece oculto.
        </Text>
      </SectionCard>
    </View>
  );
}

function Workflow({
  detail,
  onChanged,
}: {
  detail: CorporateCaseDetail;
  onChanged: () => Promise<void>;
}) {
  return (
    <View style={styles.stack}>
      <CorporateCaseFulfillmentPanel detail={detail} onChanged={onChanged} />
      <CorporateCaseApprovalPanel detail={detail} onChanged={onChanged} />
      <CorporateCaseActionPanel detail={detail} onChanged={onChanged} />
      <SectionCard title="Etapas" description="O histórico abaixo permanece somente leitura; as ações válidas aparecem no painel protegido.">
        {detail.tasks.length === 0 ? <Text style={styles.empty}>Nenhuma etapa registrada.</Text> : detail.tasks.map((task) => (
          <View key={task.taskId} style={styles.listRow}>
            <View style={styles.listCopy}>
              <Text style={styles.listTitle}>Etapa {task.stageOrder} · {taskTypeLabels[task.taskType]}</Text>
              <Text style={styles.listMeta}>{task.assignedGroupLabel} · {task.assignedProfileName ?? 'Sem responsável individual'}</Text>
              <Text style={styles.listMeta}>Prazo: {formatCorporateCaseDate(task.dueAt)}</Text>
            </View>
            <StatusBadge label={taskStatusLabels[task.status]} tone={task.status === 'completed' ? 'success' : task.status === 'expired' ? 'danger' : 'warning'} />
          </View>
        ))}
      </SectionCard>
      <SectionCard title="Aprovações" description="A pessoa ou grupo aprovador é exibido conforme a definição protegida do fluxo.">
        {detail.approvals.length === 0 ? <Text style={styles.empty}>Nenhuma aprovação requerida.</Text> : detail.approvals.map((approval) => (
          <View key={approval.approvalId} style={styles.listRow}>
            <View style={styles.listCopy}>
              <Text style={styles.listTitle}>
                {approval.requestedApproverName ?? approval.requestedApproverGroupLabel ?? 'Aprovador ainda não definido'}
              </Text>
              <Text style={styles.listMeta}>Prazo: {formatCorporateCaseDate(approval.dueAt)}</Text>
              {approval.decisionReason ? <Text style={styles.listMeta}>Justificativa: {approval.decisionReason}</Text> : null}
            </View>
            <StatusBadge label={approvalDecisionLabels[approval.decision]} tone={approval.decision === 'approved' ? 'success' : approval.decision === 'rejected' || approval.decision === 'expired' ? 'danger' : 'warning'} />
          </View>
        ))}
      </SectionCard>
    </View>
  );
}

function Messages({ detail }: { detail: CorporateCaseDetail }) {
  return (
    <SectionCard title="Atualizações visíveis" description="Conteúdo interno ou restrito só aparece quando o backend autoriza.">
      {detail.messages.length === 0 ? <Text style={styles.empty}>Nenhuma atualização visível.</Text> : detail.messages.map((message) => (
        <View key={message.messageId} style={styles.timelineRow}>
          <Text style={styles.listTitle}>{message.authorName}</Text>
          <Text style={styles.listMeta}>{formatCorporateCaseDate(message.createdAt)} · {message.visibility}</Text>
          <Text style={styles.summary} selectable>{message.body}</Text>
        </View>
      ))}
    </SectionCard>
  );
}

function Participants({ detail }: { detail: CorporateCaseDetail }) {
  return (
    <SectionCard title="Participantes" description="Observadores incluídos recebem atualizações conforme seu nível de notificação.">
      {detail.participants.length === 0 ? <Text style={styles.empty}>Nenhum participante visível.</Text> : detail.participants.map((participant) => (
        <View key={`${participant.profileId}-${participant.role}`} style={styles.listRow}>
          <View style={styles.listCopy}>
            <Text style={styles.listTitle}>{participant.name}</Text>
            <Text style={styles.listMeta}>{participantRoleLabels[participant.role]}</Text>
          </View>
          <StatusBadge
            label={participant.notificationLevel === 'all' ? 'Todas as atualizações' : participant.notificationLevel === 'important' ? 'Somente importantes' : 'Sem notificações'}
            tone={participant.notificationLevel === 'none' ? 'neutral' : 'info'}
          />
        </View>
      ))}
    </SectionCard>
  );
}

function History({ detail }: { detail: CorporateCaseDetail }) {
  return (
    <SectionCard title="Histórico auditável" description="Payloads técnicos dos eventos não são expostos pela interface.">
      {detail.events.length === 0 ? <Text style={styles.empty}>Nenhum evento visível.</Text> : detail.events.map((event) => (
        <View key={event.eventId} style={styles.timelineRow}>
          <Text style={styles.listTitle}>{event.eventType}</Text>
          <Text style={styles.listMeta}>{event.actorName} · {formatCorporateCaseDate(event.createdAt)}</Text>
        </View>
      ))}
    </SectionCard>
  );
}

export function CorporateCaseDetailScreen() {
  const params = useLocalSearchParams<{ caseId?: string | string[] }>();
  const rawCaseId = Array.isArray(params.caseId) ? params.caseId[0] : params.caseId;
  const caseId = resolveCaseId(rawCaseId);
  const [tab, setTab] = useState<DetailTab>('overview');
  const [detail, setDetail] = useState<CorporateCaseDetail | null>(null);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setLoading(true);
    setError('');
    if (!caseId || caseId === CORPORATE_CASE_STATIC_SHELL_ID || !isCorporateCaseUuid(caseId)) {
      setDetail(null);
      setError('O identificador do chamado na URL é inválido.');
      setLoading(false);
      return;
    }
    try {
      const context = await getCorporateCasesReadContext();
      if (currentRequest !== requestId.current) return;
      setEnabled(context.enabled);
      if (!context.enabled) {
        setDetail(null);
        return;
      }
      const nextDetail = await getCorporateCaseDetail(caseId);
      if (currentRequest === requestId.current) setDetail(nextDetail);
    } catch (loadError) {
      if (currentRequest === requestId.current) {
        setDetail(null);
        setError(errorMessage(loadError));
      }
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, [caseId]);

  useFocusEffect(useCallback(() => {
    void load();
    return () => { requestId.current += 1; };
  }, [load]));

  const record = detail?.case;

  return (
    <SectionPage
      eyebrow="CHAMADOS · DETALHE PROTEGIDO"
      title={record?.subject ?? 'Detalhe do chamado'}
      description={record ? `${record.protocol} · ${record.caseTypeLabel}` : 'Consultando o chamado autorizado ao seu perfil.'}
    >
      {record ? (
        <View style={styles.badges}>
          <StatusBadge label={formatCorporateCaseStatus(record.status)} tone={corporateCaseStatusTone[record.status]} />
          <StatusBadge label={`Prioridade ${corporateCasePriorityLabels[record.priority]}`} tone={corporateCasePriorityTone[record.priority]} />
        </View>
      ) : null}

      {loading ? <ControlNotice title="Chamado" message="Consultando o detalhe protegido..." tone="info" /> : null}
      {!loading && error ? (
        <FeedbackState kind="error" title="Chamado indisponível" message={error} actionLabel="Tentar novamente" onAction={() => { void load(); }} />
      ) : null}
      {!loading && !error && enabled === false ? (
        <FeedbackState kind="maintenance" title="Área ainda não habilitada" message="A ativação operacional dos chamados continua desligada no backend." />
      ) : null}
      {!loading && !error && detail ? (
        <>
          <FilterTabs tabs={detailTabs} value={tab} onChange={setTab} />
          {tab === 'overview' ? <Overview detail={detail} /> : null}
          {tab === 'workflow' ? <Workflow detail={detail} onChanged={load} /> : null}
          {tab === 'messages' ? <Messages detail={detail} /> : null}
          {tab === 'participants' ? <Participants detail={detail} /> : null}
          {tab === 'history' ? <History detail={detail} /> : null}
        </>
      ) : null}
    </SectionPage>
  );
}

const styles = StyleSheet.create({
  stack: { gap: cloudTheme.spacing.md },
  card: {
    gap: cloudTheme.spacing.md,
    padding: cloudTheme.spacing.xl,
    borderWidth: 1,
    borderColor: cloudTheme.colors.border,
    borderRadius: cloudTheme.radii.lg,
    backgroundColor: cloudTheme.colors.surface,
  },
  cardHeading: { gap: 3 },
  cardTitle: { ...cloudTheme.type.sectionTitle, color: cloudTheme.colors.text },
  cardDescription: { ...cloudTheme.type.small, color: cloudTheme.colors.textSecondary },
  summary: { ...cloudTheme.type.body, color: cloudTheme.colors.text },
  note: { ...cloudTheme.type.small, color: cloudTheme.colors.textMuted },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: cloudTheme.spacing.sm },
  definitionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: cloudTheme.spacing.md },
  definition: { minWidth: 180, flexBasis: '30%', flexGrow: 1, gap: 2 },
  definitionLabel: { ...cloudTheme.type.caption, color: cloudTheme.colors.textMuted },
  definitionValue: { ...cloudTheme.type.bodyStrong, color: cloudTheme.colors.text },
  listRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: cloudTheme.spacing.md,
    paddingVertical: cloudTheme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: cloudTheme.colors.borderSubtle,
  },
  listCopy: { flex: 1, minWidth: 220, gap: 2 },
  listTitle: { ...cloudTheme.type.bodyStrong, color: cloudTheme.colors.text },
  listMeta: { ...cloudTheme.type.small, color: cloudTheme.colors.textSecondary },
  timelineRow: {
    gap: cloudTheme.spacing.xs,
    paddingVertical: cloudTheme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: cloudTheme.colors.borderSubtle,
  },
  empty: { ...cloudTheme.type.body, color: cloudTheme.colors.textMuted },
});
