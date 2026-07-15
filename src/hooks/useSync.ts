import { useEffect, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { syncDatabase } from '../database/sync';

let syncQueue: Promise<void> = Promise.resolve();

export function useSync() {
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<Error | null>(null);
  const [isOffline, setIsOffline] = useState(false);

  const performSync = async () => {
    setIsSyncing(true);
    setSyncError(null);
    const queuedSync = syncQueue.catch(() => undefined).then(syncDatabase);
    syncQueue = queuedSync;
    try {
      await queuedSync;
      return true;
    } catch (err) {
      setSyncError(err as Error);
      return false;
    } finally {
      setIsSyncing(false);
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
