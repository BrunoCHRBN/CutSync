import React from 'react';

import { RequireControlPermission } from '@/components/require-control-permission';
import { CentralHub } from '@/modules/central/central-hub';

export default function CentralRoute() {
  return (
    <RequireControlPermission permission="control.dashboard.read">
      <CentralHub />
    </RequireControlPermission>
  );
}
