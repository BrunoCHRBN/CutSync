import {
  isClientEstablishmentLinkId,
  mapClientEstablishmentLinkMutationResult,
  mapClientEstablishmentLinks,
  type ClientEstablishmentLink,
  type ClientEstablishmentLinkMutationResult,
} from './client-establishment-links-contract';

import type { BusinessRpcArgs } from '@cutsync/database';

import { clientObservability } from '@/features/observability/client-observability';
import { supabase } from '@/lib/supabase';

type RpcError = { code?: string; message?: string; details?: string; hint?: string };
type RpcResult = { data: unknown; error: RpcError | null };
type ClientEstablishmentLinkRpcName =
  | 'get_my_establishment_client_link_requests'
  | 'confirm_establishment_client_link'
  | 'reject_establishment_client_link';
type RpcInvoker = <Name extends ClientEstablishmentLinkRpcName>(
  functionName: Name,
  args?: BusinessRpcArgs<Name>,
) => Promise<RpcResult>;

const requireClient = () => {
  if (!supabase) throw new Error('O aplicativo ainda não está conectado ao CutSync.');
  return supabase;
};

const invokeRpc = <Name extends ClientEstablishmentLinkRpcName>(
  name: Name,
  args?: BusinessRpcArgs<Name>,
) => (
  (requireClient().rpc as unknown as RpcInvoker)(name, args)
);

const errorText = (error: unknown) => {
  const value = error as RpcError;
  return [value?.code, value?.message, value?.details, value?.hint]
    .filter((part): part is string => typeof part === 'string')
    .join(' ')
    .toLowerCase();
};

const clientEstablishmentLinkErrorMessage = (error: unknown, fallback: string) => {
  const text = errorText(error);
  if (text.includes('authentication_required') || text.includes('jwt')) {
    return 'Sua sessão não pôde ser validada. Entre novamente antes de continuar.';
  }
  if (text.includes('link_request_not_found')) {
    return 'Esta solicitação não está mais disponível. Atualize a lista.';
  }
  if (text.includes('invalid_link_status')) {
    return 'Esta solicitação já foi respondida. Atualize a lista para ver o estado atual.';
  }
  if (text.includes('profile_already_linked_in_establishment')) {
    return 'Sua conta já está associada a outro cadastro desta unidade. Atualize a lista para ver o vínculo atual.';
  }
  if (text.includes('idempotency_conflict')) {
    return 'Não foi possível repetir esta ação com segurança. Atualize a lista antes de tentar novamente.';
  }
  if (text.includes('network') || text.includes('fetch') || text.includes('timeout')) {
    return 'Não foi possível conectar. Verifique sua internet e tente novamente.';
  }
  return fallback;
};

export const listMyEstablishmentClientLinks = async (): Promise<ClientEstablishmentLink[]> => {
  try {
    const { data, error } = await invokeRpc('get_my_establishment_client_link_requests');
    if (error) throw error;
    const links = mapClientEstablishmentLinks(data);
    if (!links) throw new Error('invalid_establishment_link_response');
    return links;
  } catch (error) {
    clientObservability.captureError(error, 'client_establishment_links_load_failed', {
      route: '/establishment-links',
      operation: 'get_my_establishment_client_link_requests',
    });
    throw new Error(clientEstablishmentLinkErrorMessage(
      error,
      'Não foi possível carregar seus vínculos com estabelecimentos.',
    ));
  }
};

const mutateEstablishmentClientLink = async ({
  action,
  linkId,
  requestId,
}: {
  action: 'confirm' | 'reject';
  linkId: string;
  requestId: string;
}): Promise<ClientEstablishmentLinkMutationResult> => {
  if (!isClientEstablishmentLinkId(linkId) || !isClientEstablishmentLinkId(requestId)) {
    throw new Error('Não foi possível validar esta solicitação com segurança. Atualize a lista.');
  }

  const expectedStatus = action === 'confirm' ? 'confirmed' : 'rejected';
  const rpcName = action === 'confirm'
    ? 'confirm_establishment_client_link'
    : 'reject_establishment_client_link';
  try {
    const { data, error } = await invokeRpc(
      rpcName,
      { target_link_id: linkId, target_request_id: requestId },
    );
    if (error) throw error;
    const result = mapClientEstablishmentLinkMutationResult(data, linkId, expectedStatus);
    if (!result) throw new Error('invalid_establishment_link_mutation_response');
    return result;
  } catch (error) {
    clientObservability.captureError(error, `client_establishment_link_${action}_failed`, {
      route: '/establishment-links',
      operation: rpcName,
      correlationId: requestId,
    });
    throw new Error(clientEstablishmentLinkErrorMessage(
      error,
      action === 'confirm'
        ? 'Não foi possível confirmar este vínculo.'
        : 'Não foi possível rejeitar este vínculo.',
    ));
  }
};

export const confirmEstablishmentClientLink = (linkId: string, requestId: string) => (
  mutateEstablishmentClientLink({ action: 'confirm', linkId, requestId })
);

export const rejectEstablishmentClientLink = (linkId: string, requestId: string) => (
  mutateEstablishmentClientLink({ action: 'reject', linkId, requestId })
);
