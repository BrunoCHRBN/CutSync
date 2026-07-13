import { useEffect, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { syncDatabase } from '../database/sync';

export function useSync() {
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<Error | null>(null);

  const performSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    setSyncError(null);
    try {
      await syncDatabase();
    } catch (err) {
      setSyncError(err as Error);
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    // Inscrever-se para escutar mudanças no estado da rede
    const unsubscribe = NetInfo.addEventListener((state) => {
      // Disparar sincronização automática apenas se estiver conectado e a internet for acessível
      if (state.isConnected && state.isInternetReachable !== false) {
        console.log('[useSync] Internet reestabelecida. Iniciando sync automático...');
        performSync();
      }
    });

    return () => unsubscribe();
  }, []);

  return {
    isSyncing,
    syncError,
    sync: performSync,
  };
}
