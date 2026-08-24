import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';

import {
  ControlButton,
  ControlConfirmPanel,
  ControlEmptyState,
  ControlNotice,
} from '@/components/control-ui';
import { SectionPage } from '@/components/section-page';
import { AccessRequestCard } from '@/modules/gsp/access-workflow-ui';
import { AccessWorkflowNavigation } from '@/modules/gsp/access-workflow-navigation';
import { getControlAccessErrorMessage } from '@/services/control-access';
import {
  applyControlAccessRequest,
  createControlIdempotencyKey,
  listControlAccessRequests,
  type ControlAccessRequest,
} from '@/services/control-access-workflow';

interface PendingApplication {
  request: ControlAccessRequest;
  clientRequestId: string;
}

export function AccessApplicationScreen() {
  const [requests, setRequests] = useState<ControlAccessRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState<PendingApplication | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setRequests(await listControlAccessRequests('approved'));
    } catch (loadError) {
      setError(getControlAccessErrorMessage(loadError, 'Não foi possível consultar a fila de aplicação.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void loadRequests();
    return undefined;
  }, [loadRequests]));

  const submitApplication = useCallback(async () => {
    if (!pending || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      await applyControlAccessRequest({
        requestId: pending.request.requestId,
        expectedVersion: pending.request.version,
        clientRequestId: pending.clientRequestId,
      });
      setPending(null);
      setNotice('A atribuição foi aplicada e registrada na trilha de auditoria.');
      await loadRequests();
    } catch (submitError) {
      setError(getControlAccessErrorMessage(submitError, 'Não foi possível aplicar a solicitação.'));
    } finally {
      setSubmitting(false);
    }
  }, [loadRequests, pending, submitting]);

  return (
    <SectionPage
      eyebrow="GSP · ACESSOS"
      title="Aplicação de acessos"
      description="Execute somente solicitações já aprovadas. A versão e a chave idempotente impedem aplicação duplicada ou sobre estado desatualizado."
    >
      <AccessWorkflowNavigation />
      {notice ? <ControlNotice title="Acesso aplicado" message={notice} tone="success" /> : null}
      {error ? <ControlNotice title="Aplicação não concluída" message={error} tone="danger" /> : null}
      {loading ? <ControlNotice title="Aplicação" message="Consultando solicitações aprovadas..." tone="info" /> : null}
      {!loading && !error && requests.length === 0 ? (
        <ControlEmptyState title="Nenhuma aplicação pendente" description="Não há solicitações aprovadas aguardando execução." />
      ) : null}

      {requests.map((request) => (
        <AccessRequestCard key={request.requestId} request={request}>
          <ControlButton
            label="Revisar aplicação"
            onPress={() => setPending({ request, clientRequestId: createControlIdempotencyKey() })}
            variant="outline"
          />
        </AccessRequestCard>
      ))}

      {pending ? (
        <ControlConfirmPanel
          busy={submitting}
          confirmLabel="Aplicar acesso aprovado"
          description={`${pending.request.requestedAction === 'grant' ? 'Conceder' : 'Revogar'} ${pending.request.requestedProfileLabel} para ${pending.request.targetName}. Esta etapa altera a autorização efetiva.`}
          onCancel={() => setPending(null)}
          onConfirm={() => { void submitApplication(); }}
          title={`Aplicar solicitação #${pending.request.requestNumber}`}
          tone="danger"
        />
      ) : null}
    </SectionPage>
  );
}
