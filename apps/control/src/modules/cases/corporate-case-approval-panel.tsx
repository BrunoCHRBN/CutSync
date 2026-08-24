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
  createCorporateCaseIdempotencyKey,
  decideCorporateCaseApproval,
  getCorporateCaseApprovalContext,
  type CorporateCaseApprovalContext,
  type CorporateCaseDetail,
} from '@/services/corporate-cases';
import { cloudTheme } from '@/theme/cloud-components';

interface PendingApprovalDecision {
  decision: 'approve' | 'reject';
  reason: string;
  clientRequestId: string;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function CorporateCaseApprovalPanel({
  detail,
  onChanged,
}: {
  detail: CorporateCaseDetail;
  onChanged: () => Promise<void>;
}) {
  const [context, setContext] = useState<CorporateCaseApprovalContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState<PendingApprovalDecision | null>(null);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setLoading(true);
    setError('');
    try {
      const nextContext = await getCorporateCaseApprovalContext(detail.case.caseId);
      if (currentRequest === requestId.current) setContext(nextContext);
    } catch (loadError) {
      if (currentRequest === requestId.current) {
        setContext(null);
        setError(errorMessage(loadError, 'Não foi possível consultar sua aprovação.'));
      }
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, [detail.case.caseId]);

  useEffect(() => {
    void load();
    return () => { requestId.current += 1; };
  }, [detail.case.version, load]);

  const prepare = useCallback((decision: PendingApprovalDecision['decision']) => {
    setError('');
    setNotice('');
    const normalizedReason = reason.trim();
    if (!context?.canDecide || !context.approval) {
      setError('Esta aprovação não está disponível para decisão.');
      return;
    }
    if (normalizedReason.length < 20 || normalizedReason.length > 2000) {
      setError('A justificativa interna deve ter entre 20 e 2.000 caracteres.');
      return;
    }
    setPending({
      decision,
      reason: normalizedReason,
      clientRequestId: createCorporateCaseIdempotencyKey(),
    });
  }, [context, reason]);

  const submit = useCallback(async () => {
    if (!context?.task || !context.approval || !pending || busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await decideCorporateCaseApproval({
        caseId: context.caseId,
        taskId: context.task.taskId,
        approvalId: context.approval.approvalId,
        expectedCaseVersion: context.caseVersion,
        expectedTaskVersion: context.task.taskVersion,
        expectedApprovalVersion: context.approval.approvalVersion,
        decision: pending.decision,
        reason: pending.reason,
        clientRequestId: pending.clientRequestId,
      });
      setPending(null);
      setReason('');
      setNotice(result.status === 'fulfillment'
        ? 'Aprovações consolidadas. O chamado seguiu para execução.'
        : result.status === 'rejected'
          ? 'A rejeição foi registrada e o chamado foi encerrado.'
          : `Aprovação registrada. ${result.approvedCount} de ${result.requiredApprovals} concluída(s).`);
      await onChanged();
    } catch (submitError) {
      setError(errorMessage(submitError, 'Não foi possível registrar sua decisão.'));
    } finally {
      setBusy(false);
    }
  }, [busy, context, onChanged, pending]);

  if (loading) return null;
  if (error && !context) {
    return <ControlNotice title="Aprovação indisponível" message={error} tone="danger" action={{ label: 'Tentar novamente', onPress: () => { void load(); } }} />;
  }
  if (!context?.task) return null;

  return (
    <ControlCard style={styles.panel} testID="corporate-case-approval-panel">
      <View style={styles.heading}>
        <Text style={styles.title}>Decisão nominal de aprovação</Text>
        <Text style={styles.description}>
          Cada pessoa decide apenas seu próprio slot. A última aprovação válida encaminha o chamado para execução.
        </Text>
      </View>

      {notice ? <ControlNotice title="Aprovação atualizada" message={notice} tone="success" /> : null}
      {error ? <ControlNotice title="Decisão não concluída" message={error} tone="danger" /> : null}

      <View style={styles.summary}>
        <Text style={styles.summaryTitle}>{context.approvedCount} de {context.requiredApprovals} aprovação(ões) concluída(s)</Text>
        <Text style={styles.meta}>{context.pendingCount} decisão(ões) pendente(s)</Text>
        <Text style={styles.meta}>Prazo da etapa: {formatCorporateCaseDate(context.task.dueAt)}</Text>
        {context.requiresOwnerApproval ? <Text style={styles.meta}>Ao menos uma aprovação deve ser de SaaS Owner.</Text> : null}
      </View>

      {!context.workflowEnabled ? (
        <ControlNotice title="Workflow ainda desligado" message="A decisão permanece bloqueada pelo backend." tone="warning" />
      ) : !context.approval ? (
        <Text style={styles.meta}>Você acompanha esta aprovação, mas não possui um slot nominal.</Text>
      ) : context.approval.decision !== 'pending' ? (
        <ControlNotice title="Decisão já registrada" message="Seu slot não permite uma nova decisão." tone="info" />
      ) : context.canDecide ? (
        <View style={styles.editor}>
          <ControlField
            label="Justificativa interna da decisão"
            helper="Entre 20 e 2.000 caracteres. O conteúdo não é enviado por e-mail nem copiado para eventos."
            multiline
            onChangeText={(value) => { setReason(value); setPending(null); }}
            value={reason}
          />
          <View style={styles.actions}>
            <ControlButton label="Aprovar" onPress={() => prepare('approve')} />
            <ControlButton label="Rejeitar" onPress={() => prepare('reject')} variant="danger" />
          </View>
        </View>
      ) : (
        <Text style={styles.meta}>Seu perfil não possui autorização válida para decidir neste momento.</Text>
      )}

      {pending ? (
        <ControlConfirmPanel
          busy={busy}
          confirmLabel={pending.decision === 'approve' ? 'Registrar aprovação' : 'Registrar rejeição'}
          description={pending.decision === 'approve'
            ? 'Sua aprovação será imutavelmente auditada. A execução só começa após a consolidação de todos os requisitos.'
            : 'A rejeição encerrará o chamado e cancelará as demais decisões pendentes.'}
          onCancel={() => setPending(null)}
          onConfirm={() => { void submit(); }}
          title={pending.decision === 'approve' ? 'Confirmar aprovação' : 'Confirmar rejeição'}
          tone={pending.decision === 'approve' ? 'warning' : 'danger'}
          testID="corporate-case-approval-confirmation"
        >
          <Text style={styles.reason}>{pending.reason}</Text>
        </ControlConfirmPanel>
      ) : null}
    </ControlCard>
  );
}

const styles = StyleSheet.create({
  panel: { gap: cloudTheme.spacing.lg },
  heading: { gap: cloudTheme.spacing.xs },
  title: { ...cloudTheme.type.sectionTitle, color: cloudTheme.colors.text },
  description: { ...cloudTheme.type.small, color: cloudTheme.colors.textSecondary },
  summary: { gap: cloudTheme.spacing.xs },
  summaryTitle: { ...cloudTheme.type.bodyStrong, color: cloudTheme.colors.text },
  meta: { ...cloudTheme.type.small, color: cloudTheme.colors.textSecondary },
  editor: { gap: cloudTheme.spacing.md },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: cloudTheme.spacing.sm },
  reason: { ...cloudTheme.type.body, color: cloudTheme.colors.text },
});
