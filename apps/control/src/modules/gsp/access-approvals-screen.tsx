import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  ControlButton,
  ControlConfirmPanel,
  ControlEmptyState,
  ControlField,
  ControlNotice,
} from '@/components/control-ui';
import { SectionPage } from '@/components/section-page';
import { useControlAuth } from '@/contexts/control-auth-context';
import { AccessRequestCard } from '@/modules/gsp/access-workflow-ui';
import { AccessWorkflowNavigation } from '@/modules/gsp/access-workflow-navigation';
import { getControlAccessErrorMessage } from '@/services/control-access';
import {
  createControlIdempotencyKey,
  decideControlAccessRequest,
  listControlAccessRequests,
  type ControlAccessDecision,
  type ControlAccessRequest,
} from '@/services/control-access-workflow';
import { controlColors, controlSpacing, controlType } from '@/theme/tokens';

interface PendingDecision {
  request: ControlAccessRequest;
  decision: ControlAccessDecision;
  reason: string;
  clientRequestId: string;
}

export function AccessApprovalsScreen() {
  const { context } = useControlAuth();
  const [requests, setRequests] = useState<ControlAccessRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [selected, setSelected] = useState<ControlAccessRequest | null>(null);
  const [decision, setDecision] = useState<ControlAccessDecision>('approve');
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState<PendingDecision | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setRequests(await listControlAccessRequests('awaiting_approval'));
    } catch (loadError) {
      setError(getControlAccessErrorMessage(loadError, 'Não foi possível consultar as aprovações.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void loadRequests();
    return undefined;
  }, [loadRequests]));

  const prepareDecision = useCallback(() => {
    setError('');
    if (!selected) {
      setError('Selecione uma solicitação para decidir.');
      return;
    }
    if (selected.requestedBy === context?.profileId || selected.targetProfileId === context?.profileId) {
      setError('Você é solicitante ou beneficiário e não pode aprovar esta solicitação.');
      return;
    }
    if (reason.trim().length < 10 || reason.trim().length > 500) {
      setError('Informe uma justificativa da decisão entre 10 e 500 caracteres.');
      return;
    }
    setPending({
      request: selected,
      decision,
      reason: reason.trim(),
      clientRequestId: createControlIdempotencyKey(),
    });
  }, [context?.profileId, decision, reason, selected]);

  const submitDecision = useCallback(async () => {
    if (!pending || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      await decideControlAccessRequest({
        requestId: pending.request.requestId,
        expectedVersion: pending.request.version,
        decision: pending.decision,
        reason: pending.reason,
        clientRequestId: pending.clientRequestId,
      });
      setPending(null);
      setSelected(null);
      setReason('');
      setNotice(pending.decision === 'approve' ? 'Aprovação registrada.' : 'Rejeição registrada.');
      await loadRequests();
    } catch (submitError) {
      setError(getControlAccessErrorMessage(submitError, 'Não foi possível registrar a decisão.'));
    } finally {
      setSubmitting(false);
    }
  }, [loadRequests, pending, submitting]);

  return (
    <SectionPage
      eyebrow="GSP · ACESSOS"
      title="Aprovações pendentes"
      description="Decida solicitações com segregação de funções. O backend impede autoaprovação pelo solicitante ou beneficiário."
    >
      <AccessWorkflowNavigation />
      {notice ? <ControlNotice title="Decisão registrada" message={notice} tone="success" /> : null}
      {error ? <ControlNotice title="Aprovação não concluída" message={error} tone="danger" /> : null}
      {loading ? <ControlNotice title="Aprovações" message="Consultando solicitações pendentes..." tone="info" /> : null}
      {!loading && !error && requests.length === 0 ? (
        <ControlEmptyState title="Fila em dia" description="Não há solicitações aguardando aprovação." />
      ) : null}

      {requests.map((request) => {
        const separated = request.requestedBy !== context?.profileId
          && request.targetProfileId !== context?.profileId;
        return (
          <AccessRequestCard key={request.requestId} request={request}>
            <View style={styles.actions}>
              <ControlButton
                disabled={!separated}
                label={selected?.requestId === request.requestId ? 'Selecionada' : 'Revisar solicitação'}
                onPress={() => {
                  setSelected(request);
                  setReason('');
                  setPending(null);
                }}
                variant="outline"
              />
              {!separated ? <Text style={styles.separation}>Separação de funções obrigatória.</Text> : null}
            </View>
          </AccessRequestCard>
        );
      })}

      {selected ? (
        <View style={styles.editor}>
          <Text style={styles.title}>Decidir solicitação #{selected.requestNumber}</Text>
          <View style={styles.actions}>
            <ControlButton label="Aprovar" onPress={() => setDecision('approve')} variant={decision === 'approve' ? 'primary' : 'secondary'} />
            <ControlButton label="Rejeitar" onPress={() => setDecision('reject')} variant={decision === 'reject' ? 'danger' : 'secondary'} />
          </View>
          <ControlField
            label="Justificativa da decisão"
            multiline
            onChangeText={setReason}
            value={reason}
          />
          <ControlButton label="Revisar decisão" onPress={prepareDecision} />
        </View>
      ) : null}

      {pending ? (
        <ControlConfirmPanel
          busy={submitting}
          confirmLabel={pending.decision === 'approve' ? 'Registrar aprovação' : 'Registrar rejeição'}
          description={`A decisão será registrada na solicitação #${pending.request.requestNumber} e não poderá ser substituída pelo mesmo aprovador.`}
          onCancel={() => setPending(null)}
          onConfirm={() => { void submitDecision(); }}
          title="Confirmar decisão independente"
          tone={pending.decision === 'reject' ? 'danger' : 'warning'}
        />
      ) : null}
    </SectionPage>
  );
}

const styles = StyleSheet.create({
  editor: {
    gap: controlSpacing.md,
    padding: controlSpacing.lg,
    borderWidth: 1,
    borderColor: controlColors.border,
    backgroundColor: controlColors.surface,
  },
  title: { ...controlType.sectionTitle, color: controlColors.text },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: controlSpacing.sm },
  separation: { ...controlType.smallStrong, color: controlColors.warning },
});
