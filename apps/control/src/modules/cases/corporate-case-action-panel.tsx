import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  ControlButton,
  ControlCard,
  ControlConfirmPanel,
  ControlField,
  ControlNotice,
} from '@/components/control-ui';
import { formatCorporateCaseDate } from '@/modules/cases/corporate-cases-presentation';
import {
  advanceCorporateCaseTask,
  claimCorporateCaseTask,
  createCorporateCaseIdempotencyKey,
  getCorporateCaseActionContext,
  listCorporateCaseApprovalCandidates,
  type CorporateCaseActionContext,
  type CorporateCaseDetail,
  type CorporateCaseWorkflowApprover,
} from '@/services/corporate-cases';
import { cloudTheme } from '@/theme/cloud-components';

interface PendingWorkflowAction {
  decision: 'advance' | 'reject';
  reason: string;
  approverProfileIds: string[];
  clientRequestId: string;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function CorporateCaseActionPanel({
  detail,
  onChanged,
}: {
  detail: CorporateCaseDetail;
  onChanged: () => Promise<void>;
}) {
  const [context, setContext] = useState<CorporateCaseActionContext | null>(null);
  const [approvalCandidates, setApprovalCandidates] = useState<CorporateCaseWorkflowApprover[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [reason, setReason] = useState('');
  const [selectedApprovers, setSelectedApprovers] = useState<string[]>([]);
  const [claimRequestId, setClaimRequestId] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingWorkflowAction | null>(null);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setLoading(true);
    setError('');
    try {
      const nextContext = await getCorporateCaseActionContext(detail.case.caseId);
      const nextCandidates = nextContext.canAdvance
        && nextContext.task
        && nextContext.nextStage?.taskType === 'approval'
        ? await listCorporateCaseApprovalCandidates({
          caseId: nextContext.caseId,
          taskId: nextContext.task.taskId,
        })
        : [];
      if (currentRequest === requestId.current) {
        setContext(nextContext);
        setApprovalCandidates(nextCandidates);
      }
    } catch (loadError) {
      if (currentRequest === requestId.current) {
        setContext(null);
        setError(errorMessage(loadError, 'Não foi possível consultar as ações do fluxo.'));
      }
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, [detail.case.caseId]);

  useEffect(() => {
    void load();
    return () => { requestId.current += 1; };
  }, [detail.case.version, load]);

  const claim = useCallback(async () => {
    const task = context?.task;
    if (!context || !task || busy) return;
    const clientRequestId = claimRequestId ?? createCorporateCaseIdempotencyKey();
    setClaimRequestId(clientRequestId);
    setBusy(true);
    setError('');
    try {
      await claimCorporateCaseTask({
        caseId: context.caseId,
        taskId: task.taskId,
        expectedCaseVersion: context.caseVersion,
        expectedTaskVersion: task.version,
        clientRequestId,
      });
      setClaimRequestId(null);
      setNotice('Tarefa assumida. Você já pode registrar a análise desta etapa.');
      await onChanged();
    } catch (claimError) {
      setError(errorMessage(claimError, 'Não foi possível assumir a tarefa.'));
    } finally {
      setBusy(false);
    }
  }, [busy, claimRequestId, context, onChanged]);

  const toggleApprover = useCallback((profileId: string) => {
    setSelectedApprovers((current) => current.includes(profileId)
      ? current.filter((candidate) => candidate !== profileId)
      : [...current, profileId]);
    setPending(null);
  }, []);

  const prepare = useCallback((decision: PendingWorkflowAction['decision']) => {
    setError('');
    setNotice('');
    if (!context?.task || !context.nextStage) {
      setError('A próxima etapa não está disponível.');
      return;
    }
    const normalizedReason = reason.trim();
    if (normalizedReason.length < 20 || normalizedReason.length > 2000) {
      setError('A justificativa interna deve ter entre 20 e 2.000 caracteres.');
      return;
    }
    const approverProfileIds = decision === 'advance' ? selectedApprovers : [];
    if (
      decision === 'advance'
      && context.nextStage.taskType === 'approval'
      && approverProfileIds.length !== context.nextStage.requiredApprovals
    ) {
      setError(`Selecione exatamente ${context.nextStage.requiredApprovals} aprovador(es).`);
      return;
    }
    if (
      decision === 'advance'
      && context.nextStage.requiresOwnerApproval
      && !approvalCandidates.some((approver) => (
        approver.isOwner && approverProfileIds.includes(approver.profileId)
      ))
    ) {
      setError('Este pacote exige ao menos um SaaS Owner entre os aprovadores.');
      return;
    }
    setPending({
      decision,
      reason: normalizedReason,
      approverProfileIds,
      clientRequestId: createCorporateCaseIdempotencyKey(),
    });
  }, [approvalCandidates, context, reason, selectedApprovers]);

  const submit = useCallback(async () => {
    const task = context?.task;
    if (!context || !task || !pending || busy) return;
    setBusy(true);
    setError('');
    try {
      await advanceCorporateCaseTask({
        caseId: context.caseId,
        taskId: task.taskId,
        expectedCaseVersion: context.caseVersion,
        expectedTaskVersion: task.version,
        decision: pending.decision,
        reason: pending.reason,
        approverProfileIds: pending.approverProfileIds,
        clientRequestId: pending.clientRequestId,
      });
      const completedDecision = pending.decision;
      setPending(null);
      setReason('');
      setSelectedApprovers([]);
      setNotice(completedDecision === 'reject'
        ? 'Chamado rejeitado e participantes notificados.'
        : 'Chamado encaminhado para a próxima etapa.');
      await onChanged();
    } catch (submitError) {
      setError(errorMessage(submitError, 'Não foi possível concluir a ação.'));
    } finally {
      setBusy(false);
    }
  }, [busy, context, onChanged, pending]);

  if (loading) {
    return <ControlNotice title="Ações da etapa" message="Consultando autorização e concorrência..." tone="info" />;
  }

  if (error && !context) {
    return <ControlNotice title="Ações indisponíveis" message={error} tone="danger" action={{ label: 'Tentar novamente', onPress: () => { void load(); } }} />;
  }

  if (!context?.workflowEnabled) {
    return (
      <ControlNotice
        title="Workflow ainda desligado"
        message="As etapas podem ser consultadas, mas as mutações permanecem bloqueadas pelo backend até a ativação operacional."
        tone="warning"
      />
    );
  }

  const task = context.task;
  if (task?.taskType === 'approval' || task?.taskType === 'fulfillment') return null;
  const nextStage = context.nextStage;
  const approvalStage = nextStage?.taskType === 'approval';
  const requiredApprovals = approvalStage ? nextStage.requiredApprovals : 0;

  return (
    <ControlCard style={styles.panel} testID="corporate-case-action-panel">
      <View style={styles.heading}>
        <Text style={styles.title}>Ações protegidas da etapa</Text>
        <Text style={styles.description}>
          A autorização é recalculada no backend com MFA, permissão, grupo ativo e versão atual.
        </Text>
      </View>

      {notice ? <ControlNotice title="Fluxo atualizado" message={notice} tone="success" /> : null}
      {error ? <ControlNotice title="Ação não concluída" message={error} tone="danger" /> : null}

      {!task ? (
        <Text style={styles.empty}>Não há tarefa operacional ativa neste estágio.</Text>
      ) : (
        <View style={styles.stack}>
          <View style={styles.summary}>
            <Text style={styles.summaryTitle}>Etapa {task.stageOrder} · {task.taskType === 'triage' ? 'Triagem' : 'Validação'}</Text>
            <Text style={styles.meta}>Prazo da tarefa: {formatCorporateCaseDate(task.dueAt)}</Text>
            {nextStage ? <Text style={styles.meta}>Próxima etapa: {nextStage.label}</Text> : null}
          </View>

          {context.canClaim ? (
            <ControlButton
              busy={busy}
              label="Assumir tarefa"
              onPress={() => { void claim(); }}
              testID="claim-corporate-case-task"
            />
          ) : null}

          {context.canAdvance && nextStage ? (
            <View style={styles.editor}>
              {approvalStage ? (
                <View style={styles.stack}>
                  <View style={styles.heading}>
                    <Text style={styles.subtitle}>Definir aprovadores</Text>
                    <Text style={styles.description}>
                      Selecione {requiredApprovals} pessoa(s). Solicitante, beneficiário e responsável atual são excluídos pelo backend.
                      {nextStage.requiresOwnerApproval ? ' Ao menos uma deve ser SaaS Owner.' : ''}
                    </Text>
                  </View>
                  {approvalCandidates.length === 0 ? (
                    <ControlNotice
                      title="Sem aprovadores elegíveis"
                      message="O grupo de aprovação precisa receber membros válidos antes do encaminhamento."
                      tone="warning"
                    />
                  ) : approvalCandidates.map((approver) => {
                    const selected = selectedApprovers.includes(approver.profileId);
                    const selectionFull = selectedApprovers.length >= requiredApprovals;
                    return (
                      <View key={approver.profileId} style={styles.approverRow}>
                        <View style={styles.approverCopy}>
                          <Text style={styles.summaryTitle}>{approver.name}{approver.isOwner ? ' · SaaS Owner' : ''}</Text>
                          <Text style={styles.meta}>{approver.email}</Text>
                        </View>
                        <ControlButton
                          disabled={!selected && selectionFull}
                          label={selected ? 'Selecionado' : 'Selecionar'}
                          onPress={() => toggleApprover(approver.profileId)}
                          variant={selected ? 'primary' : 'outline'}
                        />
                      </View>
                    );
                  })}
                  <Text style={styles.meta}>{selectedApprovers.length} de {requiredApprovals} selecionado(s)</Text>
                </View>
              ) : null}

              <ControlField
                label="Justificativa interna"
                helper="Entre 20 e 2.000 caracteres. O texto fica em nota interna e não é copiado para e-mails ou eventos."
                multiline
                onChangeText={(value) => { setReason(value); setPending(null); }}
                value={reason}
              />
              <View style={styles.actions}>
                <ControlButton
                  disabled={approvalStage && (
                    selectedApprovers.length !== requiredApprovals
                    || (nextStage.requiresOwnerApproval && !approvalCandidates.some((approver) => (
                      approver.isOwner && selectedApprovers.includes(approver.profileId)
                    )))
                  )}
                  label={approvalStage ? 'Encaminhar para aprovação' : 'Encaminhar para validação'}
                  onPress={() => prepare('advance')}
                />
                <ControlButton label="Rejeitar chamado" onPress={() => prepare('reject')} variant="danger" />
              </View>
            </View>
          ) : null}

          {!context.canClaim && !context.canAdvance ? (
            <Text style={styles.meta}>
              Esta tarefa está atribuída a outra pessoa ou seu perfil não possui ação válida neste momento.
            </Text>
          ) : null}

          {pending ? (
            <ControlConfirmPanel
              busy={busy}
              confirmLabel={pending.decision === 'reject' ? 'Confirmar rejeição' : 'Confirmar encaminhamento'}
              description={pending.decision === 'reject'
                ? 'A etapa será concluída, os SLAs ativos serão interrompidos e os participantes serão notificados.'
                : `A etapa será concluída e o chamado seguirá para ${nextStage?.label ?? 'a próxima etapa'}.`}
              onCancel={() => setPending(null)}
              onConfirm={() => { void submit(); }}
              title={pending.decision === 'reject' ? 'Rejeitar chamado' : 'Encaminhar chamado'}
              tone={pending.decision === 'reject' ? 'danger' : 'warning'}
              testID="corporate-case-workflow-confirmation"
            >
              <Text style={styles.confirmReason}>{pending.reason}</Text>
            </ControlConfirmPanel>
          ) : null}
        </View>
      )}
    </ControlCard>
  );
}

const styles = StyleSheet.create({
  panel: { gap: cloudTheme.spacing.lg },
  heading: { gap: cloudTheme.spacing.xs },
  title: { ...cloudTheme.type.sectionTitle, color: cloudTheme.colors.text },
  subtitle: { ...cloudTheme.type.bodyStrong, color: cloudTheme.colors.text },
  description: { ...cloudTheme.type.small, color: cloudTheme.colors.textSecondary },
  stack: { gap: cloudTheme.spacing.md },
  summary: { gap: cloudTheme.spacing.xs },
  summaryTitle: { ...cloudTheme.type.bodyStrong, color: cloudTheme.colors.text },
  meta: { ...cloudTheme.type.small, color: cloudTheme.colors.textSecondary },
  empty: { ...cloudTheme.type.body, color: cloudTheme.colors.textMuted },
  editor: { gap: cloudTheme.spacing.lg },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: cloudTheme.spacing.sm },
  approverRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: cloudTheme.spacing.md,
    paddingVertical: cloudTheme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: cloudTheme.colors.borderSubtle,
  },
  approverCopy: { flex: 1, minWidth: 220, gap: 2 },
  confirmReason: { ...cloudTheme.type.body, color: cloudTheme.colors.text },
});
