import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { useControlAuth } from '@/contexts/control-auth-context';
import {
  loadCloudActionableAlerts,
  type CloudAlertSummary,
} from '@/modules/central/central-alerts';
import { CLOUD_ROUTES } from '@/navigation/cloud-routes';

type CloudAlertsContextValue = {
  alerts: CloudAlertSummary | null;
  loading: boolean;
  refresh: () => Promise<void>;
  alertTotal: number;
  primaryAlertHref: string;
};

const CloudAlertsContext = createContext<CloudAlertsContextValue | null>(null);

export function CloudAlertsProvider({ children }: { children: React.ReactNode }) {
  const { can } = useControlAuth();
  const [alerts, setAlerts] = useState<CloudAlertSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setAlerts(await loadCloudActionableAlerts(can));
    } catch {
      setAlerts({
        total: 0,
        byArea: {},
        alerts: [],
        error: 'Não foi possível atualizar os avisos.',
      });
    } finally {
      setLoading(false);
    }
  }, [can]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo<CloudAlertsContextValue>(() => ({
    alerts,
    loading,
    refresh,
    alertTotal: alerts?.total ?? 0,
    primaryAlertHref: alerts?.alerts[0]?.href ?? CLOUD_ROUTES.central,
  }), [alerts, loading, refresh]);

  return (
    <CloudAlertsContext.Provider value={value}>
      {children}
    </CloudAlertsContext.Provider>
  );
}

export function useCloudAlerts() {
  const value = useContext(CloudAlertsContext);
  if (!value) {
    throw new Error('useCloudAlerts must be used within CloudAlertsProvider');
  }
  return value;
}
