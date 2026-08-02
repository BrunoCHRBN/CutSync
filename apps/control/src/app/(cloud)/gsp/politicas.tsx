import React from 'react';

import { RequireControlPermission } from '@/components/require-control-permission';
import { GspPoliciesScreen } from '@/modules/gsp/gsp-policies-screen';

export default function PoliticasRoute() {
  return (
    <RequireControlPermission permission="control.governance.read">
      <GspPoliciesScreen />
    </RequireControlPermission>
  );
}
