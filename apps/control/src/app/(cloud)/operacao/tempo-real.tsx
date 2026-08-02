import React from 'react';

import { LiveOperations } from '@/components/live-operations';
import { RequireControlPermission } from '@/components/require-control-permission';

export default function TempoRealRoute() {
  return (
    <RequireControlPermission permission="control.live.read">
      <LiveOperations />
    </RequireControlPermission>
  );
}
