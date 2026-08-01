import { useCallback, useEffect, useState } from 'react';

import {
  EstablishmentClientApiError,
  establishmentClientsApi,
} from '../services/establishment-clients-api';
import type { EstablishmentClientDetail } from '../types/establishment-client';

export const useEstablishmentClientDetail = (
  establishmentId: string | null,
  clientId: string,
) => {
  const [client, setClient] = useState<EstablishmentClientDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!establishmentId || !clientId) {
      setClient(null);
      setError(null);
      return;
    }
    setLoading(true);
    try {
      const detail = await establishmentClientsApi.get(establishmentId, clientId);
      setClient(detail);
      setError(null);
    } catch (cause) {
      setClient(null);
      setError(
        cause instanceof EstablishmentClientApiError
          ? cause.message
          : 'Não foi possível carregar o cadastro.',
      );
    } finally {
      setLoading(false);
    }
  }, [clientId, establishmentId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { client, loading, error, refresh };
};
