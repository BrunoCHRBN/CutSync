import React from 'react';

import { RequireControlPermission } from '@/components/require-control-permission';
import { IncidentsScreen } from '@/modules/operation/incidents-screen';

export default function IncidentesRoute() {
  return (
    <RequireControlPermission permission="control.dashboard.read">
      <IncidentsScreen />
    </RequireControlPermission>
  );
}
