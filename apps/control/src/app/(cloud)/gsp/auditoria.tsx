import React from 'react';

import { RequireControlPermission } from '@/components/require-control-permission';
import { GspAuditScreen } from '@/modules/gsp/gsp-audit-screen';

export default function AuditoriaRoute() {
  return (
    <RequireControlPermission permission="control.governance.read">
      <GspAuditScreen />
    </RequireControlPermission>
  );
}
