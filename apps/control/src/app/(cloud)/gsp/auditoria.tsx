import React from 'react';

import { RequireControlPermission } from '@/components/require-control-permission';
import { GspPlaceholder } from '@/modules/gsp/gsp-placeholder';

export default function AuditoriaRoute() {
  return (
    <RequireControlPermission permission="control.governance.read">
      <GspPlaceholder
        eyebrow="GSP · AUDITORIA"
        title="Auditoria e eventos sensíveis"
        description="Trilha de eventos administrativos e alterações privilegiadas."
        source="Auditoria Cloud"
        detail="Nenhum evento simulado é exibido nesta etapa."
      />
    </RequireControlPermission>
  );
}
