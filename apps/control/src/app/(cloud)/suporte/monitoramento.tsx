import React from 'react';

import { ControlState } from '@/components/control-state';
import { useControlAuth } from '@/contexts/control-auth-context';
import { SupportMonitoringScreen } from '@/modules/support/support-monitoring';

export default function SuporteMonitoramentoRoute() {
  const { can } = useControlAuth();

  if (!can('control.support.read')) {
    return (
      <ControlState
        title="Acesso restrito"
        message="Seu papel não permite consultar o monitoramento de suporte."
      />
    );
  }

  return <SupportMonitoringScreen />;
}
