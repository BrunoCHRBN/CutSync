import React from 'react';

import { RequireControlPermission } from '@/components/require-control-permission';
import { GspPlaceholder } from '@/modules/gsp/gsp-placeholder';

export default function GspRoute() {
  return (
    <RequireControlPermission permission="control.governance.read">
      <GspPlaceholder
        eyebrow="GSP"
        title="Governança, Segurança e Políticas"
        description="Composição de risco, revisões, auditoria e políticas. A central existente migra após paridade funcional."
        source="Central de governança existente"
        detail="As rotas atuais permanecem no Web enquanto a migração para o Cloud é validada sem perda de funcionalidades."
      />
    </RequireControlPermission>
  );
}
