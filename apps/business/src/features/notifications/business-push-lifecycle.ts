import { isNetworkStateOnline } from '@/features/connectivity/business-query';

export interface BusinessPushNetworkState {
  isConnected?: boolean;
  isInternetReachable?: boolean;
}

export const shouldSyncBusinessPushAfterReconnect = (
  previousOnline: boolean | null,
  nextState: BusinessPushNetworkState,
  appState: string,
) => previousOnline === false
  && isNetworkStateOnline(nextState)
  && appState === 'active';
