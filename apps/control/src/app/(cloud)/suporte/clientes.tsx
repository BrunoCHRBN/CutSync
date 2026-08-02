import React from 'react';

import { ControlState } from '@/components/control-state';
import { useControlAuth } from '@/contexts/control-auth-context';
import { SupportClientsScreen } from '@/modules/support/support-clients';

export default function SuporteClientesRoute() {
  const { can } = useControlAuth();

  if (!can('control.support.read')) {
    return (
      <ControlState
        title="Acesso restrito"
        message="Seu papel não permite consultar clientes no suporte."
      />
    );
  }

  return <SupportClientsScreen />;
}
