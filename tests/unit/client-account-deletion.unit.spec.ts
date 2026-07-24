import { expect, test } from '@playwright/test';

import {
  getClientAccountDeletionStatusLabel,
  type ClientAccountDeletionStatus,
} from '../../apps/client/src/features/account-deletion/client-account-deletion-state';

test('traduz todos os estados da exclusão sem expor códigos internos', () => {
  const statuses: ClientAccountDeletionStatus[] = [
    'pending',
    'processing',
    'executed',
    'rejected',
    'failed',
  ];

  expect(statuses.map(getClientAccountDeletionStatusLabel)).toEqual([
    'Solicitação recebida',
    'Exclusão em processamento',
    'Conta excluída',
    'Solicitação encerrada',
    'Aguardando nova tentativa',
  ]);
});
