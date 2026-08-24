import React from 'react';

import { RequireControlPermission } from '@/components/require-control-permission';
import { AccessApplicationScreen } from '@/modules/gsp/access-application-screen';

export default function AccessApplicationRoute() {
  return (
    <RequireControlPermission
      permission="control.access.apply"
      title="Aplicação restrita"
      message="Seu perfil não permite aplicar solicitações aprovadas."
    >
      <AccessApplicationScreen />
    </RequireControlPermission>
  );
}
