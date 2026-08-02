import React from 'react';

import { RequireControlPermission } from '@/components/require-control-permission';
import { OperationHome } from '@/modules/operation/operation-home';

export default function OperacaoRoute() {
  return (
    <RequireControlPermission permission="control.dashboard.read">
      <OperationHome />
    </RequireControlPermission>
  );
}
