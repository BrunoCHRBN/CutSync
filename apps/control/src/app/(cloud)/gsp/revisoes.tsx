import React from 'react';

import { RequireControlPermission } from '@/components/require-control-permission';
import { GspPlaceholder } from '@/modules/gsp/gsp-placeholder';

export default function RevisoesRoute() {
  return (
    <RequireControlPermission permission="control.governance.read">
      <GspPlaceholder
        eyebrow="GSP · REVISÕES"
        title="Revisões de acesso"
        description="Ciclos de revisão e evidências de menor privilégio."
        source="Revisões de acesso"
        detail="A superfície está preparada; mutações permanecem atrás de homologação e feature flag."
      />
    </RequireControlPermission>
  );
}
