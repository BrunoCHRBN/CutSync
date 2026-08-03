import { createMobileRequestId } from '@cutsync/domain';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';

import {
  BusinessButton,
  BusinessCard,
  BusinessHeader,
  BusinessNotice,
  BusinessPage,
  BusinessPill,
} from '@/components/ui/business-ui';
import { useBusinessOperational } from '@/contexts/business-operational-context';
import { useBusinessSession } from '@/contexts/business-session';
import { BusinessFeatureError } from '@/features/connectivity/business-rpc';
import {
  createBusinessQueryKey,
  shouldRetryBusinessQuery,
} from '@/features/connectivity/business-query';
import {
  activateAcceptedBusinessTeamInvitation,
  BusinessTeamInvitationActivationError,
} from '@/features/team/business-team-invitation-activation';
import { businessTeamApi } from '@/features/team/business-team-api';

const messageFor = (error: unknown) => (
  error instanceof BusinessFeatureError
  || error instanceof BusinessTeamInvitationActivationError
)
  ? error.message
  : 'Não foi possível validar este convite.';

export function BusinessTeamInvitationScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const invitationId = typeof id === 'string' ? id : '';
  const { user, isLoading: isSessionLoading } = useBusinessSession();
  const { refreshContexts, selectEstablishment } = useBusinessOperational();
  const requestId = useRef<string | null>(null);
  const activeInvitationId = useRef(invitationId);
  activeInvitationId.current = invitationId;
  const invitation = useQuery({
    queryKey: createBusinessQueryKey(user?.id ?? 'signed-out', 'pending-invitation', 'team-invitation', invitationId),
    enabled: Boolean(user && invitationId),
    queryFn: () => businessTeamApi.getMyInvitation(invitationId),
    retry: shouldRetryBusinessQuery,
  });
  const accept = useMutation({
    retry: false,
    mutationFn: async () => {
      requestId.current ??= createMobileRequestId();
      const acceptance = await businessTeamApi.acceptMyInvitation(
        invitationId,
        requestId.current,
      );
      if (activeInvitationId.current !== acceptance.invitationId) return acceptance;
      return activateAcceptedBusinessTeamInvitation(
        acceptance,
        refreshContexts,
        (establishmentId) => activeInvitationId.current === acceptance.invitationId
          ? selectEstablishment(establishmentId)
          : Promise.resolve(false),
      );
    },
    onSuccess: (acceptance) => {
      if (activeInvitationId.current !== acceptance.invitationId) return;
      requestId.current = null;
      router.replace('/today');
    },
  });

  useEffect(() => {
    requestId.current = null;
    accept.reset();
  }, [invitationId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isSessionLoading && !user) {
    return (
      <Redirect
        href={{
          pathname: '/sign-in',
          params: { redirect: `/invitations/${invitationId}` },
        }}
      />
    );
  }
  return (
    <BusinessPage testID="business-team-invitation-screen">
      <BusinessHeader
        eyebrow="CONVITE DE EQUIPE"
        title={invitation.data?.establishmentName ?? 'Validando convite'}
        description="O CutSync confirma seu contato e o estado do convite diretamente no backend."
        trailing={invitation.data ? <BusinessPill label={invitation.data.role === 'admin' ? 'Administrador' : 'Profissional'} tone="neutral" /> : null}
      />
      {invitation.isLoading ? <BusinessNotice message="Restaurando sessão e validando convite…" /> : null}
      {invitation.error ? (
        <>
          <BusinessNotice tone="danger" message={messageFor(invitation.error)} />
          <BusinessButton label="Tentar novamente" variant="secondary" onPress={() => void invitation.refetch()} />
        </>
      ) : invitation.data ? (
        <BusinessCard>
          <BusinessNotice
            tone={invitation.data.status === 'pending' ? 'neutral' : 'warning'}
            message={invitation.data.status === 'pending'
              ? `Convite válido até ${new Date(invitation.data.expiresAt).toLocaleString('pt-BR')}.`
              : `Este convite está ${invitation.data.status}.`}
          />
          {accept.error ? <BusinessNotice tone="danger" message={messageFor(accept.error)} /> : null}
          <BusinessButton
            label={accept.isError && requestId.current ? 'Tentar novamente com o mesmo comando' : 'Aceitar convite'}
            loading={accept.isPending}
            disabled={invitation.data.status !== 'pending' && !requestId.current}
            onPress={() => accept.mutate()}
          />
        </BusinessCard>
      ) : null}
    </BusinessPage>
  );
}
