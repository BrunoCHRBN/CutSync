import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';

import { ControlEmptyState, ControlNotice } from '@/components/control-ui';
import { SectionPage } from '@/components/section-page';
import { useControlAuth } from '@/contexts/control-auth-context';
import { AccessRequestCard } from '@/modules/gsp/access-workflow-ui';
import { AccessWorkflowNavigation } from '@/modules/gsp/access-workflow-navigation';
import { getControlAccessErrorMessage } from '@/services/control-access';
import {
  listControlAccessRequests,
  type ControlAccessRequest,
} from '@/services/control-access-workflow';

export function AccessMyRequestsScreen() {
  const { context } = useControlAuth();
  const [requests, setRequests] = useState<ControlAccessRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadRequests = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const rows = await listControlAccessRequests();
      setRequests(rows.filter((request) => (
        request.requestedBy === context?.profileId
        || request.targetProfileId === context?.profileId
      )));
    } catch (loadError) {
      setError(getControlAccessErrorMessage(loadError, 'Não foi possível consultar suas solicitações.'));
    } finally {
      setLoading(false);
    }
  }, [context?.profileId]);

  useFocusEffect(useCallback(() => {
    void loadRequests();
    return undefined;
  }, [loadRequests]));

  return (
    <SectionPage
      eyebrow="GSP · ACESSOS"
      title="Minhas solicitações"
      description="Acompanhe solicitações abertas por você ou que alteram seus próprios perfis de acesso."
    >
      <AccessWorkflowNavigation />
      {loading ? <ControlNotice title="Solicitações" message="Consultando a fila protegida..." tone="info" /> : null}
      {error ? (
        <ControlEmptyState
          title="Solicitações indisponíveis"
          description={error}
          action={{ label: 'Tentar novamente', onPress: () => { void loadRequests(); } }}
        />
      ) : null}
      {!loading && !error && requests.length === 0 ? (
        <ControlEmptyState
          title="Nenhuma solicitação"
          description="Você ainda não abriu nem recebeu solicitações de alteração de acesso."
        />
      ) : null}
      {requests.map((request) => <AccessRequestCard key={request.requestId} request={request} />)}
    </SectionPage>
  );
}
