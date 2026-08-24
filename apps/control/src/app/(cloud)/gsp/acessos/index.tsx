import React from 'react';

import { RequireControlPermission } from '@/components/require-control-permission';
import { AccessDirectoryScreen } from '@/modules/gsp/access-directory';

export default function AcessosRoute() {
  return (
    <RequireControlPermission
      permission="control.access.manage"
      title="Acessos restritos"
      message="Seu perfil não permite gerenciar usuários e acessos do Control."
    >
      <AccessDirectoryScreen />
    </RequireControlPermission>
  );
}
