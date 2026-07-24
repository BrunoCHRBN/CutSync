import { supabase } from '@/lib/supabase';

import type { ClientAccountDeletionStatus } from './client-account-deletion-state';

export {
  getClientAccountDeletionStatusLabel,
  type ClientAccountDeletionStatus,
} from './client-account-deletion-state';

export interface ClientAccountDeletionRequest {
  id: string;
  status: ClientAccountDeletionStatus;
  created_at: string;
  updated_at: string;
  processing_started_at?: string | null;
  executed_at?: string | null;
  decision_reason?: string | null;
}

interface RpcResult<T> {
  data: T | null;
  error: { code?: string; message?: string } | null;
}

const rpc = <T>(name: string) => (
  supabase
    ? (supabase.rpc as unknown as (functionName: string) => Promise<RpcResult<T>>)(name)
    : Promise.resolve({
        data: null,
        error: { message: 'client_not_configured' },
      } satisfies RpcResult<T>)
);

const messages: Record<string, string> = {
  authentication_required: 'Entre novamente para continuar.',
  client_profile_required: 'A exclusão pelo aplicativo está disponível apenas para contas de cliente ativas.',
  client_not_configured: 'O serviço está indisponível neste ambiente.',
};

const toMessage = (error: RpcResult<unknown>['error']) => {
  const raw = error?.message ?? 'account_deletion_request_failed';
  const known = Object.entries(messages).find(([code]) => raw.includes(code));
  return known?.[1] ?? 'Não foi possível atualizar sua solicitação. Tente novamente.';
};

const firstRequest = (data: ClientAccountDeletionRequest[] | null) => data?.[0] ?? null;

export async function getClientAccountDeletionRequest() {
  const result = await rpc<ClientAccountDeletionRequest[]>('get_client_account_deletion_request');
  if (result.error) return { request: null, message: toMessage(result.error) };
  return { request: firstRequest(result.data), message: null };
}

export async function submitClientAccountDeletionRequest() {
  const result = await rpc<ClientAccountDeletionRequest[]>('submit_client_account_deletion_request');
  if (result.error) return { request: null, message: toMessage(result.error) };
  return { request: firstRequest(result.data), message: null };
}
