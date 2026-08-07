import React from 'react';

import { RequireControlPermission } from '@/components/require-control-permission';
import { GspKnowledgeScreen } from '@/modules/gsp/gsp-knowledge-screen';

export default function ConhecimentoRoute() {
  return (
    <RequireControlPermission permission="control.knowledge.read">
      <GspKnowledgeScreen />
    </RequireControlPermission>
  );
}
