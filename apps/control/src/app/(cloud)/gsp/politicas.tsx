import React from 'react';

import { RequireControlPermission } from '@/components/require-control-permission';
import { GspPlaceholder } from '@/modules/gsp/gsp-placeholder';

export default function PoliticasRoute() {
  return (
    <RequireControlPermission permission="control.governance.read">
      <GspPlaceholder
        eyebrow="GSP · POLÍTICAS"
        title="Políticas"
        description="Políticas operacionais e de segurança aplicáveis ao workspace interno."
        source="Políticas GSP"
        detail="Conteúdo oficial será ligado após a paridade com a governança existente."
      />
    </RequireControlPermission>
  );
}
