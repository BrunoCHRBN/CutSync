import { focusManager, onlineManager } from '@tanstack/react-query';
import * as Network from 'expo-network';
import { AppState } from 'react-native';

import { isNetworkStateOnline } from './client-query';

export const installClientQueryLifecycle = () => {
  onlineManager.setEventListener((setOnline) => {
    let active = true;
    let networkEventObserved = false;
    const updateOnlineState = (state: Network.NetworkState) => {
      if (active) setOnline(isNetworkStateOnline(state));
    };

    void Network.getNetworkStateAsync()
      .then((state) => {
        if (!networkEventObserved) updateOnlineState(state);
      })
      .catch(() => undefined);

    const subscription = Network.addNetworkStateListener((state) => {
      networkEventObserved = true;
      updateOnlineState(state);
    });
    return () => {
      active = false;
      subscription.remove();
    };
  });

  focusManager.setEventListener((setFocused) => {
    setFocused(AppState.currentState === 'active');
    const subscription = AppState.addEventListener('change', (state) => {
      setFocused(state === 'active');
    });
    return () => subscription.remove();
  });

  return () => {
    onlineManager.setEventListener(() => () => undefined);
    focusManager.setEventListener(() => () => undefined);
  };
};
