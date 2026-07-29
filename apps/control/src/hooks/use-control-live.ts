import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  loadControlLiveSnapshot,
  subscribeToControlLive,
  type ControlLiveSnapshot,
  type ControlLiveSubscriptionState,
} from '@/services/control-live';

export type ControlLiveConnectionState =
  | ControlLiveSubscriptionState
  | 'stale';

const POLL_INTERVAL_MS = 60_000;
const STALE_AFTER_MS = 90_000;
const INVALIDATION_DEBOUNCE_MS = 350;

export function useControlLive() {
  const [snapshot, setSnapshot] = useState<ControlLiveSnapshot | null>(null);
  const [connectionState, setConnectionState] =
    useState<ControlLiveConnectionState>('connecting');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const requestSequence = useRef(0);
  const invalidationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSuccessAt = useRef(0);
  const subscriptionState = useRef<ControlLiveSubscriptionState>('connecting');
  const hasSnapshot = useRef(false);

  const refresh = useCallback(async (manual = false) => {
    const sequence = ++requestSequence.current;
    if (manual) setRefreshing(true);
    else if (!hasSnapshot.current) setLoading(true);
    setError('');

    try {
      const result = await loadControlLiveSnapshot();
      if (sequence !== requestSequence.current) return null;
      hasSnapshot.current = true;
      lastSuccessAt.current = Date.now();
      setSnapshot(result);
      setConnectionState(subscriptionState.current);
      return result;
    } catch {
      if (sequence === requestSequence.current) {
        setError('Não foi possível atualizar a operação agora.');
        if (hasSnapshot.current) setConnectionState('stale');
      }
      return null;
    } finally {
      if (sequence === requestSequence.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  const scheduleRefresh = useCallback(() => {
    if (invalidationTimer.current) clearTimeout(invalidationTimer.current);
    invalidationTimer.current = setTimeout(() => {
      invalidationTimer.current = null;
      void refresh();
    }, INVALIDATION_DEBOUNCE_MS);
  }, [refresh]);

  useFocusEffect(useCallback(() => {
    void refresh();
    return () => {
      requestSequence.current += 1;
    };
  }, [refresh]));

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | null = null;

    void subscribeToControlLive({
      onInvalidate: scheduleRefresh,
      onStateChange: (state) => {
        if (!active) return;
        subscriptionState.current = state;
        if (
          lastSuccessAt.current
          && Date.now() - lastSuccessAt.current >= STALE_AFTER_MS
        ) {
          setConnectionState('stale');
        } else {
          setConnectionState(state);
        }
      },
    }).then((cleanup) => {
      if (!active) {
        cleanup();
        return;
      }
      unsubscribe = cleanup;
    }).catch(() => {
      if (!active) return;
      subscriptionState.current = 'reconnecting';
      setConnectionState(hasSnapshot.current ? 'stale' : 'reconnecting');
    });

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [scheduleRefresh]);

  useEffect(() => {
    const pollTimer = setInterval(() => {
      void refresh();
    }, POLL_INTERVAL_MS);
    const staleTimer = setInterval(() => {
      if (
        lastSuccessAt.current
        && Date.now() - lastSuccessAt.current >= STALE_AFTER_MS
      ) {
        setConnectionState('stale');
      }
    }, 15_000);

    return () => {
      clearInterval(pollTimer);
      clearInterval(staleTimer);
      if (invalidationTimer.current) clearTimeout(invalidationTimer.current);
    };
  }, [refresh]);

  return {
    snapshot,
    connectionState,
    loading,
    refreshing,
    error,
    refresh,
  };
}
