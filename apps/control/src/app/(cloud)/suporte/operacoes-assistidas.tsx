import React from 'react';

import { ControlState } from '@/components/control-state';
import { useControlAuth } from '@/contexts/control-auth-context';
import { SupportAssistedOpsScreen } from '@/modules/support/support-assisted-ops';

export default function SuporteOperacoesAssistidasRoute() {
  const { can } = useControlAuth();

  if (!can('control.support.manage')) {
    return (
      <ControlState
        title="Acesso restrito"
        message="Operações assistidas exigem control.support.manage."
      />
    );
  }

  return <SupportAssistedOpsScreen />;
}
