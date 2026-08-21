import React from 'react';

import { RequireControlPermission } from '@/components/require-control-permission';
import { AccessMyRequestsScreen } from '@/modules/gsp/access-my-requests-screen';

export default function AccessMyRequestsRoute() {
  return (
    <RequireControlPermission
      permission="control.access.request"
      title="Solicitações restritas"
      message="Seu perfil não permite acompanhar solicitações de acesso."
    >
      <AccessMyRequestsScreen />
    </RequireControlPermission>
  );
}
