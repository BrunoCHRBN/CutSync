import React from 'react';

import { RequireControlPermission } from '@/components/require-control-permission';
import { AccessApprovalsScreen } from '@/modules/gsp/access-approvals-screen';

export default function AccessApprovalsRoute() {
  return (
    <RequireControlPermission
      permission="control.access.approve"
      title="Aprovações restritas"
      message="Seu perfil não permite decidir solicitações de acesso."
    >
      <AccessApprovalsScreen />
    </RequireControlPermission>
  );
}
