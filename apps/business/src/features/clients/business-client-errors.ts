import { translateEstablishmentClientError } from '@cutsync/domain';

import { BusinessFeatureError } from '@/features/connectivity/business-rpc';

export const clientErrorMessage = (
  error: unknown,
  fallback = 'Não foi possível concluir a operação com o cliente.',
) => {
  const fromDomain = translateEstablishmentClientError(error, '');
  if (fromDomain) return fromDomain;
  if (error instanceof BusinessFeatureError) return error.message;
  return fallback;
};
