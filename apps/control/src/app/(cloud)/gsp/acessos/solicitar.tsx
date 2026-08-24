import React from 'react';

import { RequireControlPermission } from '@/components/require-control-permission';
import { AccessRequestCreateScreen } from '@/modules/gsp/access-request-create-screen';

export default function AccessRequestCreateRoute() {
  return (
    <RequireControlPermission
      permission="control.access.request"
      title="Solicitação restrita"
      message="Seu perfil não permite solicitar novos acessos."
    >
      <AccessRequestCreateScreen />
    </RequireControlPermission>
  );
}
