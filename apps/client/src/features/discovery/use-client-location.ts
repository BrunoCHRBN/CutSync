import * as Location from 'expo-location';
import { useCallback, useState } from 'react';

import type { ClientDiscoveryOrigin } from '@/features/discovery/client-discovery-service';

export type ClientLocationStatus = 'idle' | 'requesting' | 'granted' | 'denied' | 'unavailable';

export interface ClientLocationState {
  origin: ClientDiscoveryOrigin | null;
  status: ClientLocationStatus;
  request: () => Promise<ClientDiscoveryOrigin | null>;
  clear: () => void;
}

// Permission is never requested on mount: the client opts in from the
// "Perto de você" control, and discovery keeps working when it is refused.
export function useClientLocation(): ClientLocationState {
  const [origin, setOrigin] = useState<ClientDiscoveryOrigin | null>(null);
  const [status, setStatus] = useState<ClientLocationStatus>('idle');

  const request = useCallback(async () => {
    setStatus('requesting');
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setOrigin(null);
        setStatus('denied');
        return null;
      }
      const position = await Location.getLastKnownPositionAsync({ maxAge: 5 * 60 * 1000 })
        ?? await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      if (!position) {
        setOrigin(null);
        setStatus('unavailable');
        return null;
      }
      const next = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };
      setOrigin(next);
      setStatus('granted');
      return next;
    } catch {
      setOrigin(null);
      setStatus('unavailable');
      return null;
    }
  }, []);

  const clear = useCallback(() => {
    setOrigin(null);
    setStatus('idle');
  }, []);

  return { origin, status, request, clear };
}
