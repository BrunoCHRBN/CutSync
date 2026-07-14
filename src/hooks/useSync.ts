import { useEffect, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { syncDatabase } from '../database/sync';

let isSyncActive = false;

export function useSync() {
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<Error | null>(null);
  const [isOffline, setIsOffline] = useState(false);

  const performSync = async () => {
    if (isSyncActive) return;
    isSyncActive = true;
    setIsSyncing(true);
    setSyncError(null);
    try {
      await syncDatabase();
    } catch (err) {
      setSyncError(err as Error);
    } finally {
      setIsSyncing(false);
      isSyncActive = false;
    }
  };

  useEffect(() => {
    // Inscrever-se para escutar mudanças no estado da rede
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsOffline(!state.isConnected || state.isInternetReachable === false);
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
    isOffline,
    sync: performSync,
  };
}
