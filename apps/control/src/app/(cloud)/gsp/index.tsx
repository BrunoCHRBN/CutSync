import React from 'react';

import { ControlState } from '@/components/control-state';
import { useControlAuth } from '@/contexts/control-auth-context';
import { GspOverview } from '@/modules/gsp/gsp-overview';

export default function GspRoute() {
  const { can } = useControlAuth();
  const allowed = (
    can('control.governance.read')
    || can('control.knowledge.read')
    || can('control.access.manage')
  );

  if (!allowed) {
    return (
      <ControlState
        title="GSP restrito"
        message="Seu papel não permite consultar Governança, Segurança e Plataforma."
      />
    );
  }

  return <GspOverview />;
}
