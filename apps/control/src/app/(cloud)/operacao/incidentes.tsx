import React from 'react';

import { ControlState } from '@/components/control-state';
import { useControlAuth } from '@/contexts/control-auth-context';
import { IncidentsScreen } from '@/modules/operation/incidents-screen';

export default function IncidentesRoute() {
  const { can } = useControlAuth();

  if (!can('control.dashboard.read')) {
    return (
      <ControlState
        title="Acesso restrito"
        message="Seu papel não permite consultar incidentes operacionais."
      />
    );
  }

  return <IncidentsScreen />;
}
