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
  claimCorporateCaseFulfillment,
  createCorporateCaseIdempotencyKey,
  executeCorporateAccessFulfillment,
  getCorporateCaseFulfillmentContext,
  type CorporateCaseDetail,
  type CorporateCaseFulfillmentContext,
} from '@/services/corporate-cases';
import { cloudTheme } from '@/theme/cloud-components';

interface PendingFulfillmentAction {
  operation: 'apply' | 'defer';
  reason: string;
  clientRequestId: string;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function failureMessage(code: string | null, retryable: boolean): string {
  const suffix = retryable
    ? ' A tarefa voltou para a fila e pode ser reconciliada antes de uma nova tentativa.'
    : ' Abra uma nova solicitação ou encaminhe para reconciliação.';
  switch (code) {
    case 'control_assignment_already_active':
      return `O pacote já está ativo para a pessoa beneficiária.${suffix}`;
    case 'control_assignment_not_active':
      return `Não existe uma atribuição delegada ativa para revogar.${suffix}`;
    case 'access_validity_expired':
    case 'access_expiry_required':
      return `A validade aprovada não permite mais aplicar o acesso.${suffix}`;
    case 'legacy_request_state_invalid':
    case 'legacy_request_expired':
    case 'legacy_applied_state_mismatch':
      return `A projeção de autoridade não está em um estado aplicável.${suffix}`;
    default:
      return `A autoridade de acesso recusou a aplicação.${suffix}`;
  }
}

export function CorporateCaseFulfillmentPanel({
  detail,
  onChanged,
}: {
  detail: CorporateCaseDetail;
  onChanged: () => Promise<void>;
}) {
  const [context, setContext] = useState<CorporateCaseFulfillmentContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [noticeTone, setNoticeTone] = useState<'success' | 'warning' | 'info'>('success');
  const [reason, setReason] = useState('');
  const [claimRequestId, setClaimRequestId] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingFulfillmentAction | null>(null);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setLoading(true);
    setError('');
    try {
      const nextContext = await getCorporateCaseFulfillmentContext(detail.case.caseId);
      if (currentRequest === requestId.current) setContext(nextContext);
    } catch (loadError) {
      if (currentRequest === requestId.current) {
        setContext(null);
        setError(errorMessage(loadError, 'Não foi possível consultar a execução.'));
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
    if (!context?.task || busy) return;
    const clientRequestId = claimRequestId ?? createCorporateCaseIdempotencyKey();
    setClaimRequestId(clientRequestId);
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await claimCorporateCaseFulfillment({
        caseId: context.caseId,
        taskId: context.task.taskId,
        expectedCaseVersion: context.caseVersion,
        expectedTaskVersion: context.task.taskVersion,
        clientRequestId,
      });
      setClaimRequestId(null);
      setNoticeTone('success');
      setNotice('Execução assumida. A aplicação real continua bloqueada até sua confirmação explícita.');
      await onChanged();
    } catch (claimError) {
      setError(errorMessage(claimError, 'Não foi possível assumir a execução.'));
    } finally {
      setBusy(false);
    }
  }, [busy, claimRequestId, context, onChanged]);

  const prepare = useCallback((operation: PendingFulfillmentAction['operation']) => {
    setError('');
    setNotice('');
    const normalizedReason = reason.trim();
    if (!context?.canExecute || !context.task || !context.request) {
      setError('Esta execução não está disponível para o seu perfil.');
      return;
    }
    if (normalizedReason.length < 20 || normalizedReason.length > 2000) {
      setError('A justificativa interna deve ter entre 20 e 2.000 caracteres.');
      return;
    }
    setPending({
      operation,
      reason: normalizedReason,
      clientRequestId: createCorporateCaseIdempotencyKey(),
    });
  }, [context, reason]);

  const submit = useCallback(async () => {
    if (!context?.task || !pending || busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await executeCorporateAccessFulfillment({
        caseId: context.caseId,
        taskId: context.task.taskId,
        expectedCaseVersion: context.caseVersion,
        expectedTaskVersion: context.task.taskVersion,
        operation: pending.operation,
        reason: pending.reason,
        clientRequestId: pending.clientRequestId,
      });
      setPending(null);
      setReason('');
      if (result.executionStatus === 'applied') {
        setNoticeTone('success');
        setNotice('A autoridade aplicou a solicitação e o chamado foi resolvido.');
      } else if (result.executionStatus === 'deferred') {
        setNoticeTone('info');
        setNotice('A execução foi devolvida à fila sem alterar acessos.');
      } else {
        setNoticeTone('warning');
        setNotice(failureMessage(result.failureCode, result.retryable));
      }
      await onChanged();
    } catch (submitError) {
      setError(errorMessage(submitError, 'Não foi possível concluir a execução.'));
    } finally {
      setBusy(false);
    }
  }, [busy, context, onChanged, pending]);

  if (loading) return null;
  if (error && !context) {
    return <ControlNotice title="Execução indisponível" message={error} tone="danger" action={{ label: 'Tentar novamente', onPress: () => { void load(); } }} />;
  }
  if (!context?.task) return null;

  const request = context.request;
  const latestOutcome = context.latestOutcome === 'applied'
    ? 'Aplicada'
    : context.latestOutcome === 'failed'
      ? 'Falhou'
      : context.latestOutcome === 'deferred'
        ? 'Devolvida à fila'
        : 'Nenhuma tentativa';

  return (
    <ControlCard style={styles.panel} testID="corporate-case-fulfillment-panel">
      <View style={styles.heading}>
        <Text style={styles.title}>Execução controlada do acesso</Text>
        <Text style={styles.description}>
          O backend revalida MFA, grupo, permissões, aprovações, segregação e versões antes de chamar a autoridade de acessos.
        </Text>
      </View>

      {notice ? <ControlNotice title="Execução atualizada" message={notice} tone={noticeTone} /> : null}
      {error ? <ControlNotice title="Execução não concluída" message={error} tone="danger" /> : null}

      <View style={styles.summary}>
        <Text style={styles.summaryTitle}>{request?.requestedAction === 'grant' ? 'Conceder' : 'Revogar'} · {request?.requestedProfileLabel ?? 'Pacote indisponível'}</Text>
        {request ? <Text style={styles.meta} selectable>Chave do pacote: {request.requestedProfileKey}</Text> : null}
        <Text style={styles.meta}>Prazo da tarefa: {formatCorporateCaseDate(context.task.dueAt)}</Text>
        {request?.requestedValidUntil ? <Text style={styles.meta}>Validade solicitada: {formatCorporateCaseDate(request.requestedValidUntil)}</Text> : null}
        <Text style={styles.meta}>Tentativas registradas: {context.attemptCount} · Último resultado: {latestOutcome}</Text>
      </View>

      {!context.workflowEnabled ? (
        <ControlNotice title="Workflow ainda desligado" message="A execução permanece bloqueada pelo backend." tone="warning" />
      ) : context.canClaim ? (
        <ControlButton
          busy={busy}
          label="Assumir execução"
          onPress={() => { void claim(); }}
          testID="claim-corporate-case-fulfillment"
        />
      ) : context.canExecute ? (
        <View style={styles.editor}>
          <ControlField
            label="Evidência e justificativa interna"
            helper="Entre 20 e 2.000 caracteres. O texto fica em nota interna e não é enviado em notificações."
            multiline
            onChangeText={(value) => { setReason(value); setPending(null); }}
            value={reason}
          />
          <View style={styles.actions}>
            <ControlButton label="Aplicar solicitação" onPress={() => prepare('apply')} />
            <ControlButton label="Devolver para a fila" onPress={() => prepare('defer')} variant="outline" />
          </View>
        </View>
      ) : (
        <ControlNotice
          title={context.separationSatisfied ? 'Execução atribuída' : 'Segregação obrigatória'}
          message={context.separationSatisfied
            ? 'A tarefa está atribuída a outra pessoa ou não está disponível neste momento.'
            : 'Solicitante, beneficiário, revisor e aprovadores deste chamado não podem executar a alteração.'}
          tone="info"
        />
      )}

      {pending ? (
        <ControlConfirmPanel
          busy={busy}
          confirmLabel={pending.operation === 'apply' ? 'Aplicar acesso' : 'Devolver para fila'}
          description={pending.operation === 'apply'
            ? 'Esta ação pode conceder ou revogar acesso real. O resultado será auditado e, se aplicado, resolverá o chamado.'
            : 'Nenhum acesso será alterado. A atribuição individual será removida e a execução voltará para o grupo responsável.'}
          onCancel={() => setPending(null)}
          onConfirm={() => { void submit(); }}
          title={pending.operation === 'apply' ? 'Confirmar alteração de acesso' : 'Confirmar devolução'}
          tone="warning"
          testID="corporate-case-fulfillment-confirmation"
        >
          <Text style={styles.reason} selectable>{pending.reason}</Text>
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
