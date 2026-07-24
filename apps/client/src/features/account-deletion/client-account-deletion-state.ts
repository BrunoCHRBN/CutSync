export type ClientAccountDeletionStatus =
  | 'pending'
  | 'processing'
  | 'executed'
  | 'rejected'
  | 'failed';

export const getClientAccountDeletionStatusLabel = (status: ClientAccountDeletionStatus) => {
  const labels: Record<ClientAccountDeletionStatus, string> = {
    pending: 'Solicitação recebida',
    processing: 'Exclusão em processamento',
    executed: 'Conta excluída',
    rejected: 'Solicitação encerrada',
    failed: 'Aguardando nova tentativa',
  };
  return labels[status];
};
