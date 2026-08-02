import React from 'react';

import { RequireControlPermission } from '@/components/require-control-permission';
import { GspReviewsScreen } from '@/modules/gsp/gsp-reviews-screen';

export default function RevisoesRoute() {
  return (
    <RequireControlPermission permission="control.governance.read">
      <GspReviewsScreen />
    </RequireControlPermission>
  );
}
