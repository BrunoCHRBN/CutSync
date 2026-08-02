import React from 'react';

import { RequireControlPermission } from '@/components/require-control-permission';
import { GspPlaceholder } from '@/modules/gsp/gsp-placeholder';

export default function ConhecimentoRoute() {
  return (
    <RequireControlPermission permission="control.knowledge.read">
      <GspPlaceholder
        eyebrow="GSP · CONHECIMENTO"
        title="Base operacional"
        description="Conteúdo oficial, rascunhos e moderação serão migrados junto com a central de governança."
        source="Base de conhecimento da governança"
        detail="A migração preservará publicação, moderação, autoria e auditoria já existentes."
      />
    </RequireControlPermission>
  );
}
