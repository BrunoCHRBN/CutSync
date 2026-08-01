import { useCallback, useEffect, useState } from 'react';

import {
  EstablishmentClientApiError,
  establishmentClientsApi,
} from '../services/establishment-clients-api';
import type { EstablishmentClient } from '../types/establishment-client';

const PAGE_SIZE = 50;

export const useEstablishmentClients = (
  establishmentId: string | null,
  query: string,
  includeArchived: boolean,
) => {
  const [clients, setClients] = useState<EstablishmentClient[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const load = useCallback(async (offset = 0, append = false) => {
    if (!establishmentId) {
      setClients([]);
      setHasMore(false);
      setError(null);
      return;
    }
    if (append) setLoadingMore(true);
    else setLoading(true);
    try {
      const page = await establishmentClientsApi.search({
        establishmentId,
        query,
        includeArchived,
        limit: PAGE_SIZE,
        offset,
      });
      setClients((current) => (append ? [...current, ...page] : page));
      setHasMore(page.length === PAGE_SIZE);
      setError(null);
    } catch (cause) {
      const message = cause instanceof EstablishmentClientApiError
        ? cause.message
        : 'Não foi possível carregar os clientes.';
      if (!append) setClients([]);
      setError(message);
      setHasMore(false);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [establishmentId, includeArchived, query]);

  useEffect(() => {
    void load(0, false);
  }, [load]);

  return {
    clients,
    loading,
    loadingMore,
    error,
    hasMore,
    refresh: () => load(0, false),
    loadMore: () => load(clients.length, true),
  };
};
